import json
import os
import base64
from decimal import Decimal

from django.shortcuts import render
from django.http import HttpRequest, HttpResponse, JsonResponse, HttpResponseForbidden
from django.contrib.auth.decorators import login_required
from django.forms import modelform_factory
from django.conf import settings
from django.db.models import Q
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import connection

from django.apps import apps
from django.core.paginator import Paginator
from django.db.utils import IntegrityError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

try:
    import app.custom as custom
except ImportError:
    custom = None


def save_uploaded_file(instance, fobj):
    """Save uploaded image/file with backwards compatibility for app.custom.file_save
    and standard Django default_storage fallback when used standalone."""
    if custom and hasattr(custom, "file_save"):
        return custom.file_save(instance, fobj)
    cn = instance._meta.db_table
    mid = instance.pk or "new"
    fn = fobj if isinstance(fobj, str) else getattr(fobj, "name", "file")
    filename = f"{cn}{mid}-{fn}"
    if not isinstance(fobj, str):
        return default_storage.save(filename, fobj)
    return filename


def map_internal_field_type(field):
    """Map Django model field to canonical column types for UI and ER visualization."""
    if field.primary_key:
        return "PrimaryKey"
    if field.is_relation and field.many_to_one:
        return "ForeignKey"
    if field.is_relation and field.many_to_many:
        return "ManyToManyField"
    itype = field.get_internal_type()
    mapping = {
        "BooleanField": "CheckBox",
        "NullBooleanField": "CheckBox",
        "DateField": "Date",
        "DateTimeField": "Date",
        "TimeField": "Time",
        "EmailField": "Email",
        "FileField": "File",
        "ImageField": "Image",
        "IntegerField": "Number",
        "BigIntegerField": "Number",
        "SmallIntegerField": "Number",
        "PositiveIntegerField": "Number",
        "DecimalField": "Number",
        "FloatField": "Number",
        "TextField": "TextArea",
    }
    return mapping.get(itype, "Text")


def get_model_table_prop(model_cls):
    """Return compact field sequence and types for a related model card."""
    seq = []
    prop = {"FieldSeq": seq}
    for f in model_cls._meta.concrete_fields:
        seq.append(f.name)
        col_type = map_internal_field_type(f)
        kind = None
        if f.is_relation and f.related_model:
            kind = f.related_model._meta.label
        prop[f.name] = (col_type, kind)
    return prop


def get_model_relations_data(app_label, model_name):
    """Extract complete relational metadata for the active model:
    - lvt: active model columns, verbose names, types, nullability, and attributes.
    - foreign: outgoing foreign key models with their columns and PKs.
    - has_many: incoming reverse relational models pointing back to this model."""
    mdl = apps.get_model(app_label, model_name)
    main_key = mdl._meta.label  # e.g. "customer.Customer"

    lvt = {
        "FieldSeq": [],
        "has_many": [],
        "app_label": app_label,
        "model_name": mdl.__name__,
        "verbose_name": str(mdl._meta.verbose_name or mdl.__name__),
    }
    foreign = {}

    for f in mdl._meta.concrete_fields:
        fname = f.name
        lvt["FieldSeq"].append(fname)
        col_type = map_internal_field_type(f)
        f_info = {
            "ColumnType": col_type,
            "lbl": str(f.verbose_name or fname),
            "null": bool(f.null),
            "blank": bool(f.blank),
            "editable": bool(f.editable),
            "unique": bool(f.unique),
            "dbindex": bool(f.db_index),
            "internal_type": f.get_internal_type(),
        }
        if f.is_relation and f.related_model:
            target_cls = f.related_model
            target_key = target_cls._meta.label
            f_info["kind"] = target_key
            if target_key not in foreign and target_key != main_key:
                foreign[target_key] = get_model_table_prop(target_cls)
        lvt[fname] = f_info

    has_many = {}
    sel_many = {}
    for rel in mdl._meta.related_objects:
        rel_cls = rel.related_model
        rel_key = rel_cls._meta.label
        if rel_key not in has_many and rel_key != main_key:
            has_many[rel_key] = get_model_table_prop(rel_cls)
            lvt["has_many"].append(rel_key)
            sel_many[rel_key] = True

    lvt["sel_many"] = sel_many
    return {
        "main_table": main_key,
        "app_label": app_label,
        "model_name": mdl.__name__,
        "lvt": lvt,
        "foreign": foreign,
        "has_many": has_many,
    }


@login_required
def er_view(request):
    """Render the full-featured interactive Entity Relations (ER) diagram."""
    if not (request.user.is_superuser or getattr(request.user, "is_admin", False)):
        return HttpResponseForbidden("Access restricted to administrators.")
    mdd = {}
    for m in apps.get_models():
        lbl = m._meta.app_label
        if lbl in ["admin", "contenttypes", "sessions"]:
            continue
        if lbl not in mdd:
            mdd[lbl] = []
        mdd[lbl].append(m.__name__)

    mdd = {k: sorted(v) for k, v in sorted(mdd.items())}
    default_app = request.GET.get("app", list(mdd.keys())[0] if mdd else "")
    default_model = request.GET.get(
        "model", mdd[default_app][0] if default_app in mdd and mdd[default_app] else ""
    )

    return render(
        request,
        "erview/default.html",
        {
            "madmin": mdd,
            "default_app": default_app,
            "default_model": default_model,
        },
    )


@login_required
def er_schema_api(request, app_label, model_name):
    """JSON API returning entity relations data for diagram visualization."""
    if not (request.user.is_superuser or getattr(request.user, "is_admin", False)):
        return HttpResponseForbidden("Access restricted to administrators.")
    try:
        data = get_model_relations_data(app_label, model_name)
        return JsonResponse(data)
    except LookupError as e:
        return JsonResponse({"error": f"Model {app_label}.{model_name} not found: {str(e)}"}, status=404)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)


@login_required
def index(request):
    assert isinstance(request, HttpRequest)
    if not (request.user.is_superuser or getattr(request.user, "is_admin", False)):
        return HttpResponseForbidden("Access restricted to administrators.")
    mdd = {}
    for m in apps.get_models():
        lbl = m._meta.app_label
        if lbl in ["admin", "contenttypes", "sessions"]:
            continue
        if lbl not in mdd:
            mdd[lbl] = []
        mdd[lbl].append(m.__name__)
    return render(request, "s_admin.html", {"madmin": mdd})


def optimize_form_querysets(form, rows=None, max_limit=1000):
    """Ensure foreign key field querysets include all used_ids from current rows
    plus a generous set of available choices (up to max_limit) without loading tens of thousands of rows."""
    for field_name, field in form.fields.items():
        if hasattr(field, "queryset") and field.queryset is not None:
            try:
                used_ids = set()
                if rows:
                    col_name = field_name + "_id"
                    for r in rows:
                        val = r.get(col_name) if col_name in r else r.get(field_name)
                        if val and isinstance(val, (int, str)) and str(val).isdigit():
                            used_ids.add(int(val))

                total_count = field.queryset.count()
                if max_limit and total_count > max_limit:
                    top_ids = list(field.queryset.values_list("pk", flat=True)[:max_limit])
                    combined_ids = set(top_ids) | used_ids
                    field.queryset = field.queryset.filter(pk__in=combined_ids)
                else:
                    field.queryset = field.queryset.all()
            except Exception:
                pass
    return form



@login_required
def model(request, app, mdl, dat=None, rd_only=None):
    if not (request.user.is_superuser or getattr(request.user, "is_admin", False)):
        return HttpResponseForbidden("Access restricted to administrators.")
    assert isinstance(request, HttpRequest)
    if request.method == "POST":
        return mdl_post(request, app, mdl)
    dat = json.loads(dat) if dat else {}
    data = getData(app, mdl, dat)
    if dat:
        data["rows"] = json.loads(json.dumps(data["rows"], default=str))
        return JsonResponse(data)
    rows_list = data["rows"]
    data["rows"] = json.dumps(rows_list, default=str)
    mdl_cls = apps.get_model(app, mdl)
    data["mdl_form"] = optimize_form_querysets(modelform_factory(mdl_cls, exclude=("id",))(mdl_cls()), rows=rows_list)
    data["rd_only"] = [] if rd_only == None else rd_only

    is_ajax = (
        request.headers.get("x-requested-with") == "XMLHttpRequest"
        or request.headers.get("sec-fetch-dest") == "empty"
        or request.GET.get("ajax") == "1"
    )
    if not is_ajax:
        mdd = {}
        for m in apps.get_models():
            lbl = m._meta.app_label
            if lbl in ["admin", "contenttypes", "sessions"]:
                continue
            if lbl not in mdd:
                mdd[lbl] = []
            mdd[lbl].append(m.__name__)
        data["madmin"] = {k: sorted(v) for k, v in sorted(mdd.items())}
        data["default"] = True
        data["sel_app"] = app
        data["sel_mdl"] = mdl_cls.__name__
        data["default_model"] = f"{app}_{mdl_cls.__name__}"
        return render(request, "s_admin.html", data)

    return render(request, "s_default.html", data)


def _resolve_gfk(rows, mdl_cls):
    """Resolve GenericForeignKey fields to display strings in-place."""
    gfk_fields = [f for f in mdl_cls._meta.get_fields() if isinstance(f, GenericForeignKey)]
    if not gfk_fields:
        return
    cache = {}
    for row in rows:
        for gfk in gfk_fields:
            fk_field = gfk.fk_field  # e.g. 'xref_object'
            ct_key = gfk.ct_field + "_id"  # e.g. 'xref_content_type_id'
            xref_id = row.get(fk_field)
            ct_id = row.get(ct_key)
            if not xref_id or not ct_id:
                row[fk_field] = ""
                continue
            cache_key = (ct_id, xref_id)
            if cache_key not in cache:
                try:
                    ct = ContentType.objects.get(pk=ct_id)
                    obj = ct.get_object_for_this_type(pk=xref_id)
                    cache[cache_key] = f"{ct.model}_{xref_id}:{obj}"
                except Exception:
                    cache[cache_key] = str(xref_id)
            row[fk_field] = cache[cache_key]


def mdlData(app, mdl, dat):
    data = getData(app, mdl, dat)
    rows_list = data["rows"]
    mdl = apps.get_model(app, mdl)
    data["rows"] = json.dumps(rows_list, default=str)
    data["mdl_form"] = optimize_form_querysets(modelform_factory(mdl, exclude=("id",))(mdl()), rows=rows_list)
    if "related" in dat:
        rel = apps.get_model(dat["related"][1], dat["related"][2])
        data["rel_form"] = optimize_form_querysets(modelform_factory(rel, exclude=("id",))(rel()), rows=rows_list)
    if "restrict" in dat:
        data["restrict"] = dat["restrict"]
    if "show" in dat:
        data["show"] = dat["show"]
    if "related" in dat:
        data["related"] = dat["related"]
    return data


def getData(app, mdl, req):
    m = apps.get_model(app, mdl)
    ordr = req["order_by"] if "order_by" in req else (m._meta.ordering[0] if m._meta.ordering else "-id")
    excl = req["exclude"] if "exclude" in req else {}
    rpp = req["rows_pp"] if "rows_pp" in req else 40
    pg = req["page_num"] if "page_num" in req else 1
    fltr = {k: True if v == "true" else v for k, v in req["filter"].items()} if "filter" in req else {}

    def get_filter_q(k, v):
        if v == "":
            clean_name = k.split("__")[0]
            if clean_name.endswith("_id"):
                return Q()
            try:
                field_obj = m._meta.get_field(clean_name)
                if field_obj.get_internal_type() not in ("CharField", "TextField"):
                    return Q()
            except Exception:
                return Q()

        if not k.endswith('__isnull'):
            return Q(**{k: v})
        field_name = k[:-8]
        try:
            curr_model = m
            field = None
            for part in field_name.split('__'):
                field = curr_model._meta.get_field(part)
                if field.is_relation and hasattr(field, 'related_model') and field.related_model:
                    curr_model = field.related_model
            if field and field.get_internal_type() in ('CharField', 'TextField'):
                if v is True:
                    return Q(**{k: True}) | Q(**{field_name: ''})
                else:
                    return Q(**{k: False}) & ~Q(**{field_name: ''})
        except Exception:
            pass
        return Q(**{k: v})

    fq = None
    if "FilterOR" in req:
        fq = Q()
        for k, v in fltr.items():
            fq |= get_filter_q(k, v)
        ml = m.objects.filter(fq)
        fq = True
    else:
        q_and = Q()
        for k, v in fltr.items():
            q_and &= get_filter_q(k, v)
        ml = m.objects.filter(q_and)
    if "related" in req and req["related"]:
        try:
            ml = ml.select_related(req["related"][0])
        except Exception:
            pass
    if excl:
        ml = ml.exclude(**excl)
    if ordr:
        try:
            ml = ml.order_by(ordr)
        except Exception:
            # Self-healing: check if order field had '_id' truncated (e.g., 'external_order' -> 'external_order_id')
            prefix = "-" if ordr.startswith("-") else ""
            clean_ordr = ordr.lstrip("-")
            candidate = f"{prefix}{clean_ordr}_id"
            try:
                ml = ml.order_by(candidate)
                ordr = candidate
            except Exception:
                default_ordr = m._meta.ordering[0] if m._meta.ordering else "-id"
                try:
                    ml = ml.order_by(default_ordr)
                    ordr = default_ordr
                except Exception:
                    ml = ml.order_by("-id")
                    ordr = "-id"
    data = Paginator(ml, rpp).get_page(pg)
    rows = [mdlDict(p) for p in data]
    _resolve_gfk(rows, m)
    if "related" in req and req["related"]:
        for ndx, x in enumerate([mdlDict(getattr(p, req["related"][0])) for p in data]):
            rows[ndx].update(x)
    return {
        "page_num": data.number,
        "order_by": ordr,
        "rows": rows,
        "n_rows": data.paginator.count,
        "rows_pp": data.paginator.per_page,
        "n_pages": data.paginator.num_pages,
        "a": app,
        "m": mdl,
        "fq": fq,
        "filter": json.dumps(fltr),
        "exclude": json.dumps(excl),
    }


def mdl_post(request, app, mdl):
    ret = "done"
    try:
        records = json.loads(request.POST["record_list"])
        mdl = apps.get_model(app, mdl)
        kys = [key for key in records.keys() if key.isdigit()]
        for mod_del in mdl.objects.filter(pk__in=kys):
            val = records[str(mod_del.pk)]
            if not val:
                mod_del.delete()
                continue
            for k in mdl._meta.fields:
                if k.__class__.__name__ == "FileField":
                    continue
                if k.__class__.__name__ == "ImageField":
                    img_data = val.get(k.column, None)
                    if not img_data or ";base64," not in img_data:
                        continue
                    format, imgstr = img_data.split(";base64,")
                    ext = format.split("/")[-1]
                    decoded_image = base64.b64decode(imgstr)
                    image_file = ContentFile(decoded_image, name=f"im.{ext}")
                    filename = save_uploaded_file(mod_del, image_file)
                    setattr(mod_del, k.column, filename)
                    continue
                if k.column in val:
                    val_parsed = parseAttr(k, val)
                    if val_parsed is not None:
                        setattr(mod_del, k.column, val_parsed)
                    elif k.null:
                        setattr(mod_del, k.column, None)
                    elif k.has_default():
                        setattr(mod_del, k.column, k.get_default())
            if hasattr(mod_del, "modified_by_id") and request.user.is_authenticated:
                mod_del.modified_by_id = request.user.id
            if mod_del.__class__.__name__ == "User" and not val["password"].startswith("pbkdf2_sha256"):
                mod_del.set_password(val["password"])
                mod_del.is_superuser = False
            mod_del.save()
        for create in [key for key in records.keys() if not key.isdigit()]:
            val = records[create]
            if not val:
                continue
            new = mdl()
            for k in mdl._meta.fields:
                if k.column == "id" or k.column not in val:
                    continue
                if k.__class__.__name__ == "FileField":
                    continue
                if k.__class__.__name__ == "ImageField":
                    img_data = val.get(k.column, None)
                    if not img_data or ";base64," not in img_data:
                        continue
                    format, imgstr = img_data.split(";base64,")
                    ext = format.split("/")[-1]
                    decoded_image = base64.b64decode(imgstr)
                    image_file = ContentFile(decoded_image, name=f"im.{ext}")
                    filename = save_uploaded_file(new, image_file)
                    setattr(new, k.column, filename)
                    continue
                val_parsed = parseAttr(k, val)
                if val_parsed is not None:
                    setattr(new, k.column, val_parsed)
                elif k.null:
                    setattr(new, k.column, None)
                elif k.has_default():
                    setattr(new, k.column, k.get_default())
            if hasattr(new, "created_by_id") and request.user.is_authenticated:
                new.created_by_id = request.user.id
            if new.__class__.__name__ == "User" and not val["password"].startswith("pbkdf2_sha256"):
                new.set_password(val["password"])
                new.is_superuser = False
            new.save()
    except Exception as e:
        ret = f"Error {app}.{mdl}:{e}"
    return HttpResponse(ret)


def mdlDict(mdl):
    mdat = {}
    for k in mdl._meta.fields:
        v = getattr(mdl, k.column)
        if v is not None:
            cn = v.__class__.__name__
            if "Decimal" in cn or "timedelta" in cn:
                v = str(v)
            elif "datetime" in cn:
                v = v.strftime("%Y-%m-%d %H:%M:%S")
            elif "date" in cn:
                v = v.strftime("%Y-%m-%d")
            elif "time" in cn:
                v = v.strftime("%H:%M:%S")
            elif "JSON" in cn and isinstance(v, str):
                v = json.loads(v)
            elif cn == "ImageFieldFile":
                v = v.url if v.name else "/media/dummy.jpg"
            elif cn == "FieldFile":
                v = v.url if v.name else "Invalid File"
        mdat[k.attname] = v
    if hasattr(mdl, "item_list") and "item_list" not in mdat:
        mdat["item_list"] = mdl.item_list
    return mdat


def parseAttr(k, mid):
    if k.column not in mid:
        return None
    ft = k.__class__.__name__
    m = mid[k.column]

    if m is None or m == "":
        if ft in ["TextField", "CharField"]:
            if m == "":
                return ""
            return None if k.null else (k.get_default() if k.has_default() else "")
        if "BooleanField" in ft:
            return k.get_default() if (not k.null and k.has_default()) else (False if not k.null else None)
        if not k.null:
            if k.has_default():
                val = k.get_default()
                if "Decimal" in ft and not isinstance(val, Decimal):
                    return Decimal(str(val))
                return val
            if "Decimal" in ft:
                return Decimal("0.0")
            if "Integer" in ft or "AutoField" in ft:
                return 0
            if "float" in ft or "Float" in ft:
                return 0.0
            return None
        return None

    if "BooleanField" in ft:
        if isinstance(m, bool):
            return m
        if isinstance(m, (int, float)):
            return bool(m)
        if isinstance(m, str):
            return m.lower() in ("true", "1", "t", "yes")
        return bool(m)

    if ft in ["TextField", "CharField"]:
        return str(m)

    if ft in ["ForeignKey", "IntegerField"] or "Integer" in ft or "AutoField" in ft:
        if "BigIntegerField" in ft:
            m_str = str(m).strip()
            if m_str.isdigit() or (m_str.startswith("-") and m_str[1:].isdigit()):
                return int(m_str)
            else:
                try:
                    return int(m_str.split("_")[1].split(":")[0])
                except (IndexError, ValueError):
                    try:
                        return int(m_str)
                    except (ValueError, TypeError):
                        return k.get_default() if (not k.null and k.has_default()) else (0 if not k.null else None)
        try:
            return int(m)
        except (ValueError, TypeError):
            return k.get_default() if (not k.null and k.has_default()) else (0 if not k.null else None)

    if "JSON" in ft:
        return json.loads(m) if isinstance(m, str) else m

    if "Decimal" in ft:
        try:
            return Decimal(str(m).strip())
        except Exception:
            if not k.null:
                val = k.get_default() if k.has_default() else Decimal("0.0")
                return Decimal(str(val)) if not isinstance(val, Decimal) else val
            return None

    if "float" in ft or "Float" in ft:
        try:
            return float(m)
        except (ValueError, TypeError):
            return k.get_default() if (not k.null and k.has_default()) else (0.0 if not k.null else None)

    # Normalize and parse Date fields
    if ft == "DateField":
        from datetime import datetime, date
        if isinstance(m, (date, datetime)):
            return m if isinstance(m, date) else m.date()
        if isinstance(m, str):
            m = m.strip().replace("/", "-").replace(".", "-")
            parts = m.split("-")
            if len(parts) == 3:
                try:
                    p0, p1, p2 = int(parts[0]), int(parts[1]), int(parts[2])
                    is_y0 = p0 in range(2000, 2100) or p0 in range(20, 40)
                    is_y2 = p2 in range(2000, 2100) or p2 in range(20, 40)
                    if is_y0 and not is_y2:
                        year = 2000 + p0 if p0 < 100 else p0
                        return date(year, p1, p2)
                    elif is_y2 and not is_y0:
                        year = 2000 + p2 if p2 < 100 else p2
                        return date(year, p1, p0)
                except ValueError:
                    pass
            for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%y-%m-%d", "%d-%m-%y"):
                try:
                    return datetime.strptime(m, fmt).date()
                except ValueError:
                    continue

    # Normalize and parse DateTime fields
    if ft == "DateTimeField":
        from datetime import datetime, date
        if isinstance(m, datetime):
            return m
        if isinstance(m, date):
            return datetime.combine(m, datetime.min.time())
        if isinstance(m, str):
            from django.utils.dateparse import parse_datetime
            try:
                parsed = parse_datetime(m)
                if parsed is not None:
                    return parsed
            except Exception:
                pass

            m = m.strip().replace("/", "-").replace(".", "-")
            dt_parts = m.split(" ")
            if len(dt_parts) == 1:
                dt_parts = m.split("T")
            
            date_str = dt_parts[0]
            time_str = dt_parts[1] if len(dt_parts) > 1 else "00:00:00"
            
            parts = date_str.split("-")
            if len(parts) == 3:
                try:
                    p0, p1, p2 = int(parts[0]), int(parts[1]), int(parts[2])
                    is_y0 = p0 in range(2000, 2100) or p0 in range(20, 40)
                    is_y2 = p2 in range(2000, 2100) or p2 in range(20, 40)
                    
                    t_parts = time_str.split(":")
                    th = int(t_parts[0]) if len(t_parts) > 0 else 0
                    tm = int(t_parts[1]) if len(t_parts) > 1 else 0
                    
                    # Safely extract integer seconds, handling any zone offset/suffix
                    ts = 0
                    if len(t_parts) > 2:
                        import re
                        sec_part = t_parts[2].split(".")[0]
                        match = re.match(r"^(\d+)", sec_part)
                        if match:
                            ts = int(match.group(1))
                    
                    if is_y0 and not is_y2:
                        year = 2000 + p0 if p0 < 100 else p0
                        return datetime(year, p1, p2, th, tm, ts)
                    elif is_y2 and not is_y0:
                        year = 2000 + p2 if p2 < 100 else p2
                        return datetime(year, p1, p0, th, tm, ts)
                except ValueError:
                    pass
            for fmt in (
                "%Y-%m-%d %H:%M:%S",
                "%Y-%m-%d %H:%M",
                "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M",
                "%Y-%m-%d",
                "%d-%m-%Y",
                "%y-%m-%d",
                "%d-%m-%y",
            ):
                try:
                    return datetime.strptime(m, fmt)
                except ValueError:
                    continue

    # Normalize and parse Time fields
    if ft == "TimeField":
        from datetime import datetime, time
        if isinstance(m, time):
            return m
        if isinstance(m, str):
            m = m.strip().replace("/", "-").replace(".", "-")
            for fmt in ("%H:%M:%S", "%H:%M"):
                try:
                    return datetime.strptime(m, fmt).time()
                except ValueError:
                    continue

    return m


def setFields(mdl, request):
    for k in mdl._meta.fields:
        m = None
        if k.column in request.FILES:
            cn = getattr(mdl, k.column, None)
            m = file_save(mdl, request.FILES[k.column], cn)
        else:
            m = parseAttr(k, request.POST)
        if m is not None:
            setattr(mdl, k.column, m)
        elif k.null:
            setattr(mdl, k.column, None)
        elif k.has_default():
            setattr(mdl, k.column, k.get_default())


def file_save(instance, fobj, cn):
    if cn:
        if isinstance(cn, str):
            fn = os.path.join(settings.MEDIA_ROOT, cn)
            os.remove(fn)
        else:
            cn.delete()
    cn = instance._meta.db_table
    if instance.id:
        mid = instance.id
    else:
        with connection.cursor() as m:
            mid = m.execute("select last_value FROM {0}_id_seq;".format(cn))[0][0] + 1
    filename = "{0}{1}-{2}".format(cn, mid, fobj.name)
    if not isinstance(fobj, str):
        fn = os.path.join(settings.MEDIA_ROOT, filename)
        with open(fn, "w+b") as destination:
            for chunk in fobj.chunks():
                destination.write(chunk)
    return filename


def SaveModel(mdl, request):
    try:
        setFields(mdl, request)
        mdl.save()
        return None
    except (IntegrityError, Exception) as e:
        return "Error " + str(e)


def getForm(mdl, mid, f=None):
    form = modelform_factory(mdl, exclude=("id",))
    form = form(mdl.objects.get(pk=mid) if mid else mdl())
    lvt = {"id": mid}
    for k in list(form.base_fields.keys()):
        ff = form.fields[k]
        typ = getattr(ff.widget, "input_type", "textarea")
        opt = None
        if typ == "select":
            if f and k in f:
                ff.limit_choices_to.update(f[k])
            opt = sorted(ff.choices, key=lambda x: x[1])
        if typ == "file" and getattr(form.data, k).__class__.__name__ == "ImageFieldFile" and mid:
            value = getattr(form.data, k)
            if not value:
                value = "dummy.jpg"
            typ = f'img src="{settings.MEDIA_URL}{value}" height="auto" width="auto"'
        val = getattr(form.data, k)
        lvt.update(
            {
                k: {
                    "lbl": ff.label,
                    "val": val.id if val and typ == "select" else val,
                    "typ": typ,
                    "attr": ff.widget.attrs,
                    "opt": opt,
                }
            }
        )
    return lvt
