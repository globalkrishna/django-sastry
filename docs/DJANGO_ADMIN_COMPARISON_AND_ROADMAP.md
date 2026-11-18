# Django-Sastry vs. Django Admin: Feature Comparison & Future Roadmap

**Document Version:** 1.0.0  
**Target Release:** v2.1.0+  
**Date:** November 18, 2026  

---

## 1. Executive Summary

`django-sastry` was built as a modern, lightweight, spreadsheet-like administrative and data manipulation engine for Django. It replaces Django Admin's rigid, page-reload-heavy workflow with an interactive, high-performance UI inspired by Google Sheets and Airtable.

While Sastry significantly outperforms standard `django.contrib.admin` in inline data editing, schema introspection, visualization, and zero-boilerplate setup, standard Django Admin contains several mature workflow patterns that are valuable for complex enterprise administration.

This document serves as the canonical audit of feature parity, gaps, and the architectural roadmap for `django-sastry v2.1.0+`.

---

## 2. Feature Parity Matrix

| Feature Category | Standard `django.contrib.admin` | `django-sastry` (v2.1.0) | Parity Status | Status in Sastry |
| :--- | :--- | :--- | :--- | :--- |
| **Inline Grid Editing** | Poor (`list_editable` forces full page reload) | **Native spreadsheet grid** with live multi-cell batch save (`SaveAll`) | 🟢 **Sastry Superpower** | Enhanced |
| **Model Registration** | Manual boilerplate (`admin.site.register()`) required for all models | **Zero-boilerplate** automatic schema introspection and discovery | 🟢 **Sastry Superpower** | Native |
| **Schema Visualization** | None (requires external graphviz/extensions) | **Built-in interactive ER diagram** (`erview/`) with zoom, pan, export | 🟢 **Sastry Superpower** | Native |
| **Password Management** | Complex multi-step change form (`SetPasswordForm`) | **Direct plain-text auto-hashing** with existing hash detection | 🟢 **Sastry Superpower** | Native |
| **Multi-Tenancy** | Requires custom model managers or complex overrides | **Native tenant manager** built into query and data pipelines | 🟢 **Sastry Superpower** | Native |
| **Custom Bulk Actions** | `@admin.action` registry with dropdown execution on selected rows | **Multi-row cell edits + `@sastry_action` toolbar dropdown registry** | 🟢 **Full Parity** | Implemented (v2.1.0) |
| **FK Autocomplete** | Select2 Ajax search (`autocomplete_fields`) for massive tables (1M+ rows) | **Dynamic Ajax `/sastry/autocomplete/` search with DOM crash protection** | 🟢 **Full Parity** | Implemented (v2.1.0) |
| **Read-Only Fields** | `readonly_fields = (...)` displays text/badges, prevents edit | **`dat["rd_only"]`, model options, header lock badges & `mdl_post` tampering protection** | 🟢 **Full Parity** | Implemented (v2.1.0) |
| **Master-Detail Inlines** | `TabularInline` & `StackedInline` on parent changeform | **Dual-Mode Extension Pattern (`ShowTab('ExtraDetail')`)** | 🟢 **Full Parity** | Native |
| **Date Hierarchy** | `date_hierarchy = 'created_at'` drill-down breadcrumb bar | Column filter modal | ⚪ **Future** | v2.2.0 |
| **Form Fieldsets** | `fieldsets = (...)` with collapsible sections & multi-column rows | Linear vertical field sequence | ⚪ **Future** | v2.2.0 |
| **Audit Trail** | Built-in `LogEntry` tracks additions, changes, and diffs | External app model logs | ⚪ **Future** | v2.3.0 |
| **Granular Permissions** | Object-level & model-level hooks (`has_change_permission`, etc.) | Multi-tenant role whitelisting & auth gates | ⚪ **Future** | v2.3.0 |
| **Custom List Filters** | `SimpleListFilter` with arbitrary SQL/Q expressions | Column-attribute string/choice filters | ⚪ **Future** | v2.3.0 |

---

## 3. Detailed Gap Analysis & Proposed Designs

### Gap 1: Custom Bulk Actions Registry
- **Django Admin Reference**:
  ```python
  @admin.action(description="Mark selected orders as Delivered")
  def mark_delivered(modeladmin, request, queryset):
      queryset.update(status='DELIVERED')
  ```
- **Sastry Gap**:
  In Sastry, the bulk action toolbar has hardcoded buttons: *Delete* and *Download* (CSV/JSON). Users cannot register arbitrary actions to run on selected row IDs.
- **Proposed Sastry Architecture**:
  1. Add an action registry dictionary in `sastry/dbadmin.py`:
     ```python
     # sastry/actions.py or dbadmin.py
     MODEL_ACTIONS = {}  # { 'app.model': [action_fn, ...] }
     ```
  2. Provide a simple decorator:
     ```python
     from sastry.actions import sastry_action

     @sastry_action(description="Approve Invoices")
     def approve_invoices(request, queryset):
         queryset.update(is_approved=True)
         return {"success": True, "message": f"Updated {queryset.count()} records."}
     ```
  3. Frontend: Render registered action options in a dropdown next to *Delete* in `s_default.html` / `s_crud.ts`. When triggered, send selected IDs via POST to `/sastry/action/<app>/<model>/<action_name>/`.

---

### Gap 2: Server-Side Async Autocomplete for Massive ForeignKeys
- **Django Admin Reference**:
  `autocomplete_fields = ['customer', 'voucher_item']` queries `/admin/autocomplete/?term=foo` asynchronously as the user types.
- **Sastry Gap**:
  Currently, Sastry loads FK choices upfront into `<datalist>` or `<select>` options. For massive tables (e.g. `VoucherItem` with 496,000 rows), this causes severe DOM memory overhead and browser freezes. Sastry v2.0.7 introduced a `safety_threshold=10000` to prevent crashing, but tables exceeding this threshold cannot easily be searched inline.
- **Proposed Sastry Architecture**:
  1. Expose a lightweight search endpoint:
     `GET /sastry/<app>/<model>/autocomplete/?q=<search_term>&limit=20`
  2. In `s_FieldEditModal.html` or inline grid cell editing, if a ForeignKey model has rows `> safety_threshold`, render an async search input that fetches matching options on keystroke (debounced at 250ms).

---

### Gap 3: Read-Only Fields (`readonly_fields`)
- **Django Admin Reference**:
  `readonly_fields = ('created_at', 'updated_at', 'calculated_total')`
- **Sastry Gap**:
  In Sastry, all introspected fields are rendered as editable `<input>` controls unless completely excluded. Accidental modification of audit timestamps, primary keys, or auto-calculated fields is possible.
- **Proposed Sastry Architecture**:
  1. Support `SASTRY_READONLY_FIELDS = {'app.model': ['created_at', 'updated_at', ...]}` or model attribute `sastry_readonly`.
  2. In `s_cru.html` / `s_default.html`, render these fields with `readonly disabled` attributes and styled as muted badges/text.

---

### Gap 4: Master-Detail Inlines (`TabularInline`)
- **Django Admin Reference**:
  Editing an `Order` and its `OrderItem` lines simultaneously on one change form.
- **Sastry Current Alternative**:
  Sastry utilizes the **Master-Detail Extension Pattern**:
  - Subclass `db_crud` in TypeScript.
  - Listen to `#ShowExtraDetail` and override `ShowTab('ExtraDetail')`.
  - Fetch custom HTML or render a dedicated child grid.
- **Proposed Generic Sastry Architecture**:
  Provide an auto-generated child grid tab when a model has reverse ForeignKeys (e.g., `related_name`), allowing users to click a row and view/edit related child records without writing custom extension templates.

---

### Gap 5: Date Hierarchy Drill-Down
- **Django Admin Reference**:
  `date_hierarchy = 'created_at'` creates a top breadcrumb bar: `2026 > Nov > 18`.
- **Proposed Sastry Architecture**:
  If a date field is flagged in config, render a horizontal chip group at the top of the table showing year/month drill-downs that dynamically update the `dat["filter"]` and reload the table via `mdlData`.

---

## 4. Immediate Roadmap (v2.1.0 Focus)

For the next development sprint, prioritize the **Top 3 High-Impact Features**:

1. **`readonly_fields` support**:
   - Quickest to implement (~15 lines in template/dbadmin).
   - Prevents accidental edits on sensitive or generated fields.

2. **Custom Bulk Actions hook**:
   - Enables business logic execution from the changelist without custom page creation.

3. **Async Autocomplete for massive ForeignKeys**:
   - Eliminates the 10,000-row limit completely and supports tables with millions of records.

---

## 5. Local Testing & Verification Checklist (After 10:00 AM)

When resuming testing in the local development environment (`saas3.local` / `http://127.0.0.1:8000/sastry/`):

- [ ] **Dark Mode Modal Check**: Verify Group and Permission checkboxes in `/sastry/app/User/{}/` have proper contrast, padding, and alignment.
- [ ] **Password Field Update Check**: Test updating a user's password using plain text in Sastry and confirm login works with the new password.
- [ ] **Large Model ForeignKey Check**: Load `/sastry/acc/BillPayment/{}/` and verify that models with massive related tables do not hang or freeze the browser.
- [ ] **Tag & Git State**: Confirm local repository is clean and aligned with PyPI `django-sastry==2.0.7`.
