/**
 * Make a POST request with CSRF token (Standalone helper)
 */
export async function postWithCsrf(url, formData) {
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value ||
        (document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '');
    formData.append('csrfmiddlewaretoken', csrfToken);
    return fetch(url, {
        method: 'POST',
        headers: { 'X-CSRFToken': csrfToken },
        body: formData
    });
}
export class db_crud {
    collection = [];
    xpos = 0;
    lkup = null;
    fields = [];
    href = null;
    form = null;
    modififed = false;
    ndx = null;
    sel_rows = [];
    spinner;
    tmpl = null;
    csrf = null;
    filter = {};
    FilterOR = false;
    exclude = {};
    FieldEdit = null;
    constructor() {
        this.collection = [];
        this.xpos = 0;
        this.lkup = null;
        this.fields = [];
        this.href = null;
        this.form = null;
        this.modififed = false;
        this.ndx = null;
        this.sel_rows = [];
        this.spinner = '<div class="d-flex justify-content-center"><div class="spinner-border" role="status">' +
            '<span class="sr-only">Loading...</span></div></div >';
        this.tmpl = null;
        this.csrf = null;
        if (document.cookie && document.cookie !== '')
            this.csrf = document.cookie.split('=')[1];
        const sbtn = document.getElementById('SaveAll');
        if (sbtn) {
            const observer = new MutationObserver(() => {
                if (sbtn.disabled) {
                    sbtn.classList.remove('btn-danger');
                    sbtn.classList.add('btn-outline-danger');
                }
                else {
                    sbtn.classList.remove('btn-outline-danger');
                    sbtn.classList.add('btn-danger');
                }
            });
            observer.observe(sbtn, { attributes: true, attributeFilter: ['disabled'] });
        }
    }
    setData() {
        if (!this.filter || Object.keys(this.filter).length === 0) {
            this.filter = JSON.parse(document.getElementById('ApplyFilter').getAttribute('data-filter') || '{}');
            this.FilterOR = document.getElementById('FilterOR').checked;
            this.exclude = JSON.parse(document.getElementById('ApplyFilter').getAttribute('data-exclude') || '{}');
        }
        this.href = document.getElementById('cru_form').getAttribute('action');
        this.collection = JSON.parse(document.querySelector('#index tbody').dataset.rows || '[]');
        this.fields = Array.from(document.querySelectorAll('#index th')).map(x => {
            let dat = (x.getAttribute('data-col') || '').split(',');
            dat[2] = dat[2].toLowerCase() == 'true';
            dat.push(x.classList.contains('d-none'));
            return dat;
        });
        document.getElementById('HideColumns').innerHTML = this.fields.slice(1).reduce((iv, cv, ndx) => {
            let val = cv[0];
            if (val.endsWith('_id'))
                val = val.slice(0, -3);
            val = val.replaceAll('_', ' ');
            return (iv + '<div class="form-check">' +
                `<input class="form-check-input" type="checkbox" value="${2 + ndx}" ${cv[3] ? ' checked' : ''}>` +
                `<label class="form-check-label text-capitalize" for="flexCheckDefault">${val}</label></div>`);
        }, '');
        this.lkup = Object.fromEntries(Array.from(document.querySelectorAll('#cru_form datalist'))
            .map(s => [s.id.slice(2), Object.fromEntries(Array.from(s.querySelectorAll('option'))
                .map((o) => [o.dataset.pk, o.value]))]));
        this.xpos = -1;
        const cf = document.getElementById('cru_form');
        this.form = cf.innerHTML;
        this.sel_rows = [];
        this.render();
    }
    render() {
        this.ShowTab('index');
        let page_num = document.getElementById('PageNum');
        const n_pages = parseInt(page_num.getAttribute('max') || '0');
        const n_rows = parseInt(page_num.getAttribute('data-nrows') || '0');
        document.getElementById('n_pages').textContent = 'of ' + n_pages + (n_pages > 1 ? ' Pages' : '');
        document.getElementById('n_rows').textContent = n_rows + ' Row' + (n_rows > 1 ? 's' : '');
        let pnum = parseInt(page_num.value);
        if (pnum > 10)
            document.getElementById('rows_pp_m2').classList.remove('d-none');
        else
            document.getElementById('rows_pp_m2').classList.add('d-none');
        if (pnum + 10 < n_pages)
            document.getElementById('rows_pp_p2').classList.remove('d-none');
        else
            document.getElementById('rows_pp_p2').classList.add('d-none');
        this.ndx = null;
        this.tbodyRender();
        document.getElementById('spinner').innerHTML = '';
        let itbl = document.getElementById('index-table');
        if (this.xpos < 0) {
            this.xpos = 0;
            if (itbl.getBoundingClientRect().width > window.innerWidth)
                document.querySelector('main').classList.remove('container');
            else
                document.querySelector('main').classList.add('container');
        }
        const ht = window.innerHeight - itbl.getBoundingClientRect().top -
            document.querySelector('footer').offsetHeight - 8 + 'px';
        itbl.parentElement.style.height = ht;
        itbl.scrollLeft = this.xpos;
        this.setIcon();
        document.getElementById('PageNum').onkeyup = (e) => this.PageNumKeyUp(e);
        document.getElementById('PageNum').onchange = (e) => this.loadPageNum(e);
        document.getElementById('rows_pp').onkeyup = (e) => this.RowPP_KeyUp(e);
        document.getElementById('rows_pp').onchange = (e) => this.changeRowsPP(e);
        document.getElementById('order_by').onchange = (e) => this.loadPageNum(e);
        document.getElementById('set_rows_pp').onclick = (e) => this.changeRowsPP(e);
        document.querySelector('th input').onchange = (e) => this.setResetAll(e);
        document.getElementById('rows_pp_p2').onclick = (e) => this.changeRowsPM10(e);
        document.getElementById('rows_pp_m2').onclick = (e) => this.changeRowsPM10(e);
        document.getElementById('com-exp').onclick = (e) => this.setMain(e);
        document.getElementById('order_dir').onclick = (e) => this.changeDir(e);
        if (document.getElementById('edit'))
            document.getElementById('edit').onclick = (e) => this.setEdit(e);
        if (document.getElementById('add-record'))
            document.getElementById('add-record').onclick = (e) => this.setEdit(e);
        if (document.getElementById('setFilter'))
            document.getElementById('setFilter').onclick = (e) => this.showCruFilter(e);
        if (document.getElementById('SaveAll'))
            document.getElementById('SaveAll').onclick = (e) => this.SaveRecords(e);
        if (document.getElementById('del-record'))
            document.getElementById('del-record').onclick = (e) => this.DeleteRecords(e);
        document.getElementById('apply_hide').onclick = (e) => this.hide_columns(e);
        document.getElementById('hide-all').onclick = (e) => this.set_hide(e);
        document.getElementById('download').onclick = (e) => this.download(e);
        var tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
        document.getElementById('setIndex').onclick = () => this.ShowTab('index');
        document.getElementById('ShowExtraDetail').onclick = () => this.ShowTab('ExtraDetail');
        const fe = document.getElementById('FieldEdit');
        if (fe) {
            fe.querySelector('.modal-footer button.btn-primary').onclick = (e) => this.cellSave(e);
            this.FieldEdit = new bootstrap.Modal(document.getElementById('FieldEdit'));
            fe.addEventListener('hidden.bs.modal', () => fe.removeAttribute('aria-hidden'));
        }
    }
    ShowTab(w) {
        let ele = document.querySelector('#content .collapse.show');
        if (ele) {
            if (ele.id == w)
                return;
            ele.classList.remove('show');
        }
        document.getElementById(w).classList.add('show');
    }
    PageNumKeyUp(e) {
        if (e.keyCode == 13)
            this.loadPageNum();
    }
    RowPP_KeyUp(e) {
        if (e.keyCode == 13)
            document.getElementById('set_rows_pp').click();
    }
    changeRowsPM10(e) {
        let ele = document.getElementById('PageNum');
        let tgt = e.target.tagName == 'I' ? e.target.parentElement : e.target;
        let nval = parseInt(ele.value) + parseInt(tgt.getAttribute('data-mod'));
        let max = parseInt(ele.getAttribute('max') || '0');
        let min = parseInt(ele.getAttribute('min') || '0');
        if (nval <= max && nval >= min) {
            ele.value = nval.toString();
            this.loadPageNum();
        }
    }
    hide_columns(e) {
        document.querySelectorAll('.offcanvas-body input').forEach((x) => {
            let th = document.querySelector(`thead th:nth-child(${x.value})`);
            if (x.checked != th.classList.contains('d-none')) {
                let td = document.querySelectorAll(`#index tbody tr td:nth-child(${x.value})`);
                if (x.checked) {
                    th.classList.add('d-none');
                    td.forEach(y => y.classList.add('d-none'));
                }
                else {
                    th.classList.remove('d-none');
                    td.forEach(y => y.classList.remove('d-none'));
                }
            }
        });
    }
    set_hide(e) {
        document.querySelectorAll('.offcanvas-body input').forEach((x) => x.checked = e.target.checked);
    }
    tbodyRender() {
        const tbody = document.querySelector('#index tbody');
        tbody.innerHTML = '';
        const hideColumns = Array.from(document.querySelectorAll('.offcanvas-body input:checked')).map((x) => parseInt(x.value));
        const tb = tbody; // Reference to tbody for appending rows
        this.collection.forEach((row, count) => {
            const tr = document.createElement('tr');
            this.fields.forEach((field, index) => {
                const td = document.createElement('td');
                if (hideColumns.includes(index + 1))
                    td.classList.add('d-none');
                let txt = row[field[0]];
                switch (field[1]) {
                    case 'ForeignKey':
                        const rawField = field[0].endsWith('_id') ? field[0].slice(0, -3) : field[0];
                        const fkLkup = (this.lkup && (this.lkup[field[0]] || this.lkup[rawField] || this.lkup[`${rawField}_id`])) || null;
                        td.dataset.val = txt != null ? String(txt) : '';
                        td.textContent = (txt != null && txt !== '' && fkLkup && fkLkup[txt] != null) ? fkLkup[txt] : (txt != null && txt !== 'null' ? String(txt) : '');
                        break;
                    case 'IntegerField':
                        td.textContent = txt;
                        break;
                    case 'BooleanField':
                    case 'NullBooleanField':
                        const checked = txt == true || txt === 'True' || txt === 'true';
                        td.dataset.val = String(checked);
                        td.innerHTML = checked ? '<i class="bi bi-check-lg"></i>' : '<i class="bi bi-x"></i>';
                        break;
                    case 'ImageField':
                        td.dataset.val = txt || '';
                        td.dataset.name = field[0];
                        if (typeof txt === 'string' && txt.startsWith('/media/media/'))
                            txt = txt.slice(6);
                        const imgSrc = (txt && txt !== 'null' && typeof txt === 'string') ? txt : '/media/dummy.jpg';
                        const height = !txt || txt === 'null' || String(txt).includes('dummy') ? 1 : 5;
                        td.innerHTML = `<img src="${imgSrc}" onerror="this.onerror=null; this.src='/media/dummy.jpg'; this.style.height='1rem';" alt="No Image" style="width:auto; max-width:90%; height:${height}rem">`;
                        break;
                    case 'DateTimeField':
                        td.textContent = txt ? txt.slice(0, 10) : '';
                        break;
                    default:
                        const baseField = field[0].endsWith('_id') ? field[0].slice(0, -3) : field[0];
                        const genLkup = (this.lkup && (this.lkup[field[0]] || this.lkup[baseField] || this.lkup[`${baseField}_id`])) || null;
                        if (field[0] === 'chk') {
                            td.innerHTML = `<input type="checkbox" style="width:2rem; height:1rem"${this.sel_rows.includes(count) ? ' checked' : ''}/>`;
                        }
                        else if (genLkup) {
                            td.dataset.val = txt != null ? String(txt) : '';
                            td.textContent = (txt != null && txt !== '' && genLkup[txt] != null) ? genLkup[txt] : (txt != null && txt !== 'null' ? String(txt) : '');
                        }
                        else {
                            txt = txt && txt !== 'null' ? (typeof txt === 'object' ? JSON.stringify(txt) : txt) : '';
                            td.textContent = txt || '';
                        }
                        break;
                }
                tr.appendChild(td);
            });
            tb.appendChild(tr);
        });
        const indexElem = document.getElementById('index');
        indexElem.querySelectorAll('tr td:not(:first-child)').forEach((cell) => cell.onclick = (e) => this.cellEdit(e));
        indexElem.querySelectorAll('tr td:nth-of-type(1)').forEach((cell) => cell.onclick = (e) => this.rowSelect(e));
        document.getElementById('setIndex').click();
        indexElem.style.maxHeight = `${window.innerHeight - indexElem.getBoundingClientRect().top}px`;
        const firstRow = tbody.querySelector('tr');
        if (firstRow) {
            if (!this.ndx)
                this.ndx = 1;
            tbody.querySelector(`tr:nth-child(${this.ndx}) td:nth-child(3)`).click();
        }
    }
    rowSelect(e) {
        let tr = document.querySelector('#index tbody tr.table-active');
        if (tr)
            tr.classList.remove('table-active');
        tr = e.target.closest('tr');
        let ndx = tr.rowIndex - 1;
        if (this.sel_rows.includes(ndx)) {
            this.sel_rows.splice(this.sel_rows.indexOf(tr.rowIndex - 1), 1);
            tr.querySelector('input').checked = false;
        }
        else {
            this.sel_rows.push(ndx);
            tr.querySelector('input').checked = true;
        }
        if (!tr.querySelector('input').checked) {
            tr = !this.sel_rows.length ? document.querySelector('#index tbody tr:first-child') :
                document.querySelector(`#index tbody tr:nth-of-type(${1 + Math.min.apply(null, this.sel_rows)})`);
        }
        tr.classList.add('table-active');
    }
    trSetSelected(tr) {
        this.ndx = tr.rowIndex - 1;
        tr.classList.add('table-active');
        if (document.getElementById('edit'))
            document.getElementById('edit').disabled = false;
    }
    DeleteRecords(e) {
        const trc = document.querySelectorAll('#index tbody tr input:checked');
        if (!trc.length) {
            alert('Nothing Selected\r\nCheck the box');
            return;
        }
        const ndx = Array.from(trc).map(n => n.closest('tr').rowIndex);
        if (!confirm(`Delete ${ndx.length} Record${ndx.length > 1 ? 's?' : '?'}`)) {
            return;
        }
        ndx.sort((a, b) => b - a).forEach(n => {
            this.collection.splice(n - 1, 1);
            document.querySelector(`#index tbody tr:nth-child(${n})`).remove();
        });
        const warningRow = document.querySelector('#index tr.table-active');
        if (warningRow)
            warningRow.classList.remove('table-active');
        //document.getElementById('del-record').disabled = true;
        this.sel_rows = [];
        this.setSelCount();
        this.enb_save();
        /*const tooltipId = document.getElementById('del-record').getAttribute('aria-describedby');
        if (tooltipId) {
            document.getElementById(tooltipId).classList.remove('show');
        }*/
    }
    SaveRecords(e) {
        const orig = JSON.parse(document.querySelector('#index tbody').getAttribute('data-rows') || '[]');
        const org = Object.fromEntries(orig.map((x) => [x.id, x]));
        const cud = {};
        let cnt = 0, mod_cnt = 0;
        const chk_del = {};
        this.collection.forEach(x => {
            if (x.id in org) {
                if (Object.entries(x).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(org[x.id][k]))) {
                    cud[x.id] = x;
                    mod_cnt++;
                }
            }
            else {
                cud[`new${cnt}`] = x;
                cnt++;
            }
            chk_del[x.id] = x;
        });
        const del_cnt = orig.reduce((count, x) => {
            if (!(x.id in chk_del)) {
                cud[x.id] = null;
                return count + 1;
            }
            return count;
        }, 0);
        let str = '';
        if (cnt)
            str += `Add ${cnt} Record${cnt > 1 ? 's' : ''}\r\n`;
        if (del_cnt)
            str += `Delete ${del_cnt} Record${del_cnt > 1 ? 's' : ''}\r\n`;
        if (mod_cnt)
            str += `Update ${mod_cnt} Record${mod_cnt > 1 ? 's' : ''}\r\n`;
        if (!str) {
            alert('No Changes detected');
        }
        else if (confirm(str)) {
            const formData = new FormData();
            formData.append('csrfmiddlewaretoken', document.querySelector('[name=csrfmiddlewaretoken]').value);
            formData.append('record_list', JSON.stringify(cud));
            postWithCsrf(`${this.href}''/`, formData)
                .then((response) => response.text())
                .then((data) => {
                alert(data);
                if (data === 'Cleared') {
                    document.querySelector('#SaveAll').classList.add('d-none');
                }
            })
                .catch((error) => console.error('Error:', error));
        }
        document.getElementById('SaveAll').disabled = true;
    }
    setResetAll(e) {
        if (e.target.checked) {
            this.sel_rows = [...Array(this.collection.length + 1).keys()].slice(1);
            document.querySelectorAll('#index tbody input').forEach((x) => x.checked = true);
        }
        else {
            this.sel_rows = [];
            document.querySelectorAll('#index tbody input').forEach((x) => x.checked = false);
        }
        this.setSelCount();
    }
    setSelCount() {
        if (this.sel_rows.length) {
            //document.getElementById('del-record').disabled = false;
            document.getElementById('sel-rows').textContent = document.querySelectorAll('#index tbody input:checked').length + ' Selected';
        }
        else {
            //document.getElementById('del-record').disabled = true;
            document.getElementById('sel-rows').textContent = '';
        }
    }
    setMain(e) {
        document.querySelector('main').classList.toggle('container');
        this.setIcon();
        e.target.closest('button').blur();
    }
    setIcon() {
        document.querySelector('#com-exp i').className = document.querySelector('main').classList.contains('container') ?
            'bi bi-arrows-angle-expand' : 'bi bi-arrows-angle-contract';
    }
    enb_save() {
        if (!document.getElementById('SaveAll'))
            return;
        document.getElementById('SaveAll').disabled = false;
        this.modififed = true;
        this.tbodyRender();
    }
    FormEdit_keyup(e) {
        if (e.key != 'Enter')
            return;
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
    SaveModel() {
        const cform = document.getElementById('cru_form');
        let ndx = document.querySelector('#index tbody tr.table-active');
        let ndx_val = ndx ? ndx.rowIndex - 1 : -1;
        let nr = false;
        if (ndx_val < 0) {
            ndx_val = this.collection.length;
            this.collection[ndx_val] = {};
            nr = true;
        }
        const fdt = new FormData(cform);
        fdt.forEach((val, key) => {
            if (key.startsWith('csrf'))
                return;
            if (key.startsWith('FK') /* && key.endsWith('_id')*/) {
                const el = document.getElementById(key);
                const childs = el ? Array.from(el.children) : [];
                const fieldName = key.slice(2);
                let pkValue = '';
                if (val) {
                    const match = childs.find(y => y.value == val || y.dataset?.pk == val || y.textContent?.trim() == val);
                    pkValue = match?.dataset?.pk ?? (match ? match.value : val);
                }
                this.collection[ndx_val][fieldName] = pkValue;
                const row = this.collection[ndx_val];
                if (row && !(fieldName in row) && ((fieldName + '_id') in row)) {
                    row[fieldName + '_id'] = pkValue;
                }
            }
            else if (val instanceof File) {
                const imgElement = cform.querySelector(`img[data-imgid=${key}]`);
                this.collection[ndx_val][key] = imgElement ? imgElement.src : '';
            }
            else {
                this.collection[ndx_val][key] = key == 'id' && nr ? `new${ndx_val + 1}` : val;
            }
        });
        this.enb_save();
        document.getElementById('setIndex').click();
    }
    imgSave(e) {
        if (!e.target.files.length)
            return;
        const file = e.target.files[0];
        if (!file.type.startsWith('image/')) {
            document.querySelector('#index td.table-active')?.classList.remove('table-active');
            alert('Invalid Image file');
            return;
        }
        const reader = new FileReader();
        const img_id = e.target.id;
        reader.onload = (event) => {
            const result = event.target.result;
            const td = document.querySelector('#index td.table-active');
            if (!td) {
                document.querySelector(`#cru_form img[data-imgid="${img_id}"]`).src = result;
            }
            else {
                const ndx = document.querySelector('#index tr.table-active').rowIndex - 1;
                this.collection[ndx][td.dataset.name] = result;
                td.querySelector('img').src = result;
                td.classList.remove('table-active');
                this.enb_save();
            }
        };
        reader.readAsDataURL(file);
    }
    ApplyFilter(e) {
        this.filter = {};
        this.exclude = {};
        let dat = new FormData(document.getElementById('cru_form'));
        dat.forEach((value, key) => {
            let isForeignKey = key.startsWith('FK') /* && key.endsWith('_id')*/;
            let elementId = isForeignKey ? key.slice(2) : key;
            let ele = document.getElementById(elementId);
            if (!ele || ele.id === 'id' || ele.type === 'file')
                return;
            let cond = ele.previousElementSibling;
            if (ele.type === 'checkbox') {
                value = String(value).toLowerCase() === 'true';
                if (!cond || cond.tagName !== 'SELECT') {
                    cond = ele.parentElement?.previousElementSibling;
                }
            }
            if (!cond)
                return;
            let cond_val = cond.value;
            if (!cond_val)
                return;
            if (isForeignKey) {
                let fkv = Array.from(document.getElementById(key).children).find((y) => y.value === value);
                key = key.slice(2);
                value = fkv ? fkv.dataset.pk : value;
            }
            if (cond_val === '__isnull') {
                this.filter[key + cond_val] = !value || String(value).toLowerCase() === 'true';
            }
            else if (cond_val === '=') {
                this.filter[key] = value;
            }
            else if (cond_val === 'exclude') {
                this.exclude[key] = value;
            }
            else {
                this.filter[key + cond_val] = value;
            }
        });
        this.FilterOR = document.getElementById('FilterOR').checked;
        this.setColl(1);
        document.getElementById('setIndex').click();
    }
    addElement(s, opt) {
        const ins = document.getElementById(opt).cloneNode(true);
        ins.removeAttribute('id');
        s.before(ins);
        let s2 = null;
        if (opt === 'opt_num') {
            s2 = s.cloneNode(true);
            s2.removeAttribute('name');
            s2.removeAttribute('id');
            s2.setAttribute('title', 'Ignored except for "Between" Option Lower Limit');
            ins.before(s2);
        }
        const w = s.getAttribute('id');
        const filterEntry = this.filter[w];
        const excludeEntry = this.exclude[w];
        if (filterEntry) {
            ins.value = '=';
            s.value = s.list ? this.lkup[s.id][filterEntry] : filterEntry;
        }
        else if (excludeEntry) {
            ins.value = 'exclude';
            s.value = excludeEntry;
        }
        else {
            const ndx = Object.keys(this.filter).find(x => x.startsWith(w));
            if (!ndx) {
                s.value = '';
            }
            else {
                if (Array.isArray(this.filter[ndx]) && s2) {
                    s.value = this.filter[ndx][1];
                    s2.value = this.filter[ndx][0];
                }
                else if (ndx.includes('null')) {
                    s.value = this.filter[ndx] || '';
                }
                else {
                    s.value = this.filter[ndx];
                }
                ins.value = ndx.slice(ndx.indexOf('__'));
            }
        }
    }
    showCruFilter(e) {
        if (!this.form) {
            alert('No Data');
            return;
        }
        let cru = document.getElementById('cru_form');
        cru.innerHTML = this.form;
        document.querySelectorAll('#cru_form input[list]').forEach(s => {
            this.addElement(s, 'opt_fkey');
        });
        document.querySelectorAll('#cru_form input[type=number],input[type=date],input[type=datatime-local]')
            .forEach(s => {
            this.addElement(s, 'opt_num');
        });
        document.querySelectorAll('#cru_form input[type=text], textarea').forEach(s => {
            this.addElement(s, 'opt_txt');
        });
        const filtr = Object.keys(this.filter).length;
        document.querySelectorAll('#cru_form .form-check-input').forEach((s) => {
            let ins = document.getElementById('opt_chk').cloneNode(true);
            ins.removeAttribute('id');
            s.before(ins);
            let val = s.querySelectorAll('input')[1];
            if (val && filtr && val.id in this.filter) {
                ins.value = '=';
                val.checked = this.filter[val.id];
            }
        });
        this.setFormHt();
    }
    setFormData(ndx) {
        Object.entries(this.collection[ndx]).forEach(([key, value]) => {
            let ele = document.querySelector(`#cru_form #${key}`);
            if (!ele && key.endsWith('_id')) {
                const baseKey = key.slice(0, -3);
                ele = document.querySelector(`#cru_form #FK${baseKey}`) || document.querySelector(`#cru_form #${baseKey}`);
            }
            if (!ele)
                return;
            switch (ele.type) {
                case 'file':
                    const img = document.querySelector(`img[data-imgid=${ele.id}]`);
                    img.src = value;
                    img.parentElement.nextElementSibling
                        .querySelector('label').textContent = `Replace Image:${value.slice(1 + value.indexOf('-'))}`;
                    break;
                case 'checkbox':
                    ele.checked = value === true || value === 'true' || value === 'True';
                    break;
                case 'datetime-local':
                    if (value && value !== 'null') {
                        ele.value = String(value).trim().replace(' ', 'T').slice(0, 19);
                    }
                    else {
                        ele.value = '';
                    }
                    break;
                case 'date':
                    if (value && value !== 'null') {
                        ele.value = String(value).trim().slice(0, 10);
                    }
                    else {
                        ele.value = '';
                    }
                    break;
                default:
                    if (ele.list) {
                        const lookupKey = ele.id.startsWith('FK') ? ele.id.slice(2) : ele.id;
                        const rawLk = lookupKey.endsWith('_id') ? lookupKey.slice(0, -3) : lookupKey;
                        const formLkup = (this.lkup && (this.lkup[lookupKey] || this.lkup[rawLk] || this.lkup[`${rawLk}_id`])) || null;
                        ele.value = value && value !== 'null' ? (formLkup?.[value] || value) : '';
                    }
                    else if (typeof value === 'object') {
                        ele.value = value && value !== 'null' ? JSON.stringify(value) : '';
                    }
                    else {
                        ele.value = value && value !== 'null' ? value : '';
                    }
            }
        });
    }
    setEdit(e) {
        if (!this.form) {
            alert('No Data');
            return;
        }
        const cruForm = document.getElementById('cru_form');
        cruForm.innerHTML = this.form;
        const editButton = e.target.closest('button').id === 'edit';
        const indexRow = document.querySelector('#index tbody tr.table-active');
        if (editButton) {
            const ndx = indexRow.rowIndex - 1;
            this.setFormData(ndx);
        }
        else {
            document.querySelectorAll('#index tbody input:checked').forEach((input) => input.checked = false);
            if (indexRow)
                indexRow.classList.remove('table-active');
            document.querySelector('#cru_form #id').value = `new${this.collection.length}`;
        }
        this.setFormHt('Save');
        document.querySelectorAll('input[type="file"]').forEach((input) => input.onchange = (e) => this.imgSave(e));
    }
    setFormHt(which) {
        this.ShowTab('form-edit');
        const saveButton = document.getElementById('Save');
        const applyFilterDiv = document.getElementById('ApplyFilter');
        if (which === 'Save') {
            saveButton.parentElement.classList.remove('d-none');
            applyFilterDiv.classList.add('d-none');
            saveButton.onclick = () => this.SaveModel();
        }
        else {
            document.getElementById('FilterOR').checked = this.FilterOR;
            saveButton.parentElement.classList.add('d-none');
            applyFilterDiv.classList.remove('d-none');
            applyFilterDiv.querySelector('button').onclick = (e) => this.ApplyFilter(e);
        }
        document.getElementById('Close').onclick = () => this.ShowTab('index');
        const fdiv = document.querySelector('#cru_form div:first-of-type');
        const maxHeight = window.innerHeight - document.querySelector('footer').offsetHeight -
            fdiv.offsetTop - 32;
        fdiv.style.maxHeight = `${maxHeight}px`;
    }
    changeDir(e) {
        let tgt = e.target.closest('button');
        if (tgt.dataset.dir) {
            tgt.dataset.dir = '';
            tgt.innerHTML = '<i class="bi bi-sort-alpha-down"></i>';
        }
        else {
            tgt.dataset.dir = '-';
            tgt.innerHTML = '<i class="bi bi-sort-alpha-up-alt"></i>';
        }
        this.loadPageNum();
    }
    loadPageNum(e) {
        let inp = document.getElementById('PageNum');
        let val = parseInt(inp.value);
        let max = parseInt(inp.max);
        if (val > max) {
            val = max;
            inp.value = String(max);
        }
        this.setColl(val);
    }
    changeRowsPP(e) {
        let ele = document.getElementById('rows_pp');
        let max = parseInt(ele.max);
        let min = parseInt(ele.min);
        let rpp = parseInt(ele.value);
        if (rpp > max)
            ele.value = String(max);
        else if (rpp < min)
            ele.value = String(min);
        this.setColl(1);
    }
    setColl(page_num) {
        document.getElementById('setIndex').click();
        this.xpos = document.querySelector('#index table').parentElement.scrollLeft;
        let dat = {};
        if (document.getElementById('order_by').value)
            dat.order_by = document.getElementById('order_dir').dataset.dir + document.getElementById('order_by').value;
        dat.filter = this.filter;
        dat.exclude = this.exclude;
        dat.page_num = page_num;
        dat.rows_pp = document.getElementById('rows_pp').value;
        dat.show = Array.from(document.querySelectorAll('.offcanvas-body input:not(:checked)')).map((x) => parseInt(x.value));
        const rel = document.getElementById('related');
        if (rel)
            dat.related = JSON.parse(rel.value.replace(/'/g, '"'));
        const res = document.getElementById('restrict');
        if (res)
            dat.restrict = JSON.parse(res.value.replace(/'/g, '"'));
        if (this.FilterOR)
            dat.FilterOR = true;
        const hr = this.href + JSON.stringify(dat) + '/';
        document.querySelector('#index tbody').innerHTML = '';
        document.getElementById('spinner').innerHTML = this.spinner;
        fetch(hr)
            .then(async (response) => {
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`);
            }
            return response.json();
        })
            .then(dat => this.setTables(dat)) // Directly use the callback here
            .catch(error => {
            document.getElementById('spinner').innerHTML = '';
            console.error('Error fetching data:', error);
        });
    }
    download(e) {
        let csv = [];
        const indexThead = document.querySelector('#index thead') || document.querySelector('#index-table thead');
        if (indexThead) {
            csv.push(Array.from(indexThead.querySelectorAll('tr th:not(.d-none)')).slice(1).map(x => '"' + (x.textContent || '').trim().replace(/"/g, '""').toUpperCase() + '"').join(','));
        }
        else {
            csv.push(Array.from(document.querySelectorAll('thead tr th:not(.d-none)')).slice(1).map(x => '"' + (x.textContent || '').trim().replace(/"/g, '""').toUpperCase() + '"').join(','));
        }
        document.querySelectorAll('#index tbody tr').forEach(x => {
            csv.push(Array.from(x.querySelectorAll('td:not(.d-none)')).slice(1).map(x => {
                let text = (x.textContent || '').trim();
                if (text.startsWith('+'))
                    text = text.slice(1);
                return '"' + text.replace(/"/g, '""') + '"';
            }).join(','));
        });
        const csvStr = csv.join('\r\n');
        const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        let hiddenElement = document.createElement('a');
        hiddenElement.href = url;
        hiddenElement.target = '_blank';
        let fn = 'export';
        if (this.href) {
            let cleanHref = this.href.replace(/\/+$/, '');
            fn = cleanHref.slice(1 + cleanHref.lastIndexOf('/')) || 'export';
        }
        hiddenElement.download = fn + '.csv';
        document.body.appendChild(hiddenElement);
        hiddenElement.click();
        document.body.removeChild(hiddenElement);
        URL.revokeObjectURL(url);
    }
    setTables(data) {
        if (typeof (data) == typeof (''))
            data = JSON.parse(data);
        let pn = document.getElementById('PageNum');
        pn.value = data.page_num;
        pn.max = data.n_pages;
        pn.dataset.nrows = data.n_rows;
        document.getElementById('rows_pp').value = data.rows_pp;
        this.collection = data.rows;
        document.querySelector('#index tbody').dataset.rows = JSON.stringify(this.collection);
        this.sel_rows = [];
        this.render();
    }
    cellEdit(e) {
        const td = e.target.closest('td');
        const tr = td.closest('tr');
        const ndx = td.cellIndex;
        if (!tr.classList.contains('table-active')) {
            const previousWarning = tr.parentElement.querySelector('tr.table-active');
            if (previousWarning)
                previousWarning.classList.remove('table-active');
            const previousDark = document.querySelector('#index td.table-active');
            if (previousDark)
                previousDark.classList.remove('table-active');
            tr.classList.add('table-active');
            const editBtn = document.getElementById('edit');
            if (editBtn)
                editBtn.disabled = false;
            this.ndx = tr.rowIndex;
            return null;
        }
        if (!this.FieldEdit) {
            this.ShowTab('ExtraDetail');
            return;
        }
        if (ndx >= this.fields.length)
            return [tr.rowIndex, td.cellIndex];
        if (!this.fields[ndx][2]) {
            alert('Not editable');
            return false;
        }
        document.getElementById('cru_form').innerHTML = this.form;
        const ele = document.querySelector(`#cru_form #${this.fields[ndx][0]}`);
        if (this.fields[ndx][1] === 'ImageField') {
            td.classList.add('table-active');
            ele.onchange = (e) => this.imgSave(e);
            ele.click();
            return;
        }
        const cpy = ele.parentElement.cloneNode(true);
        cpy.children[1].removeAttribute('id');
        cpy.children[1].classList.add('fs-5');
        cpy.classList.add('fs-5');
        const f = this.FieldEdit._element;
        f.querySelector('form').innerHTML = cpy.outerHTML;
        f.setAttribute('data-trtd', JSON.stringify([tr.rowIndex, ndx]));
        const [eid, typ] = this.fields[ndx];
        switch (typ) {
            case 'JSONField':
                const textarea = f.querySelector('textarea');
                textarea.spellcheck = false;
                textarea.rows = 20;
                textarea.textContent = td.textContent ? JSON.stringify(JSON.parse(td.textContent), null, 4) : '';
                break;
            case 'ForeignKey':
                const rawEid = eid.endsWith('_id') ? eid.slice(0, -3) : eid;
                const editLkup = (this.lkup && (this.lkup[eid] || this.lkup[rawEid] || this.lkup[`${rawEid}_id`])) || null;
                const isFalsy = !td.dataset.val || td.dataset.val === 'null' || td.dataset.val === 'None' || td.dataset.val === 'undefined';
                f.querySelector('input[list]').value = (!isFalsy && editLkup?.[td.dataset.val]) ? editLkup[td.dataset.val] : (isFalsy ? '' : td.dataset.val);
                const dl = document.getElementById(`FK${eid}`) || document.getElementById(`FK${rawEid}`);
                if (dl) {
                    f.querySelector('form').appendChild(dl.cloneNode(true));
                }
                break;
            case 'BooleanField':
            case 'NullBooleanField':
                const chk = this.collection[this.ndx - 1][this.fields[ndx][0]];
                f.querySelector('input.form-check-input').checked = chk == true || chk == 'true' || chk == 'True';
                break;
            case 'TextField':
                f.querySelector('textarea').value = td.textContent;
                break;
            default:
                f.querySelector('input').value = td.textContent;
        }
        this.FieldEdit.show();
    }
    cellSave(e) {
        const ndx = document.querySelector('#index tr.table-active');
        const formData = new FormData(document.querySelector('#FieldEdit form'));
        let fdt = Object.fromEntries(formData);
        const [key, value] = Object.entries(fdt)[0];
        if (key.startsWith('FK') /* && key.endsWith('_id')*/) {
            const option = Array.from(document.querySelectorAll(`#${key} option`)).find((opt) => opt.value === value);
            const fieldName = key.slice(2);
            const pkValue = value ? option?.dataset.pk : '';
            fdt[fieldName] = pkValue;
            // If the row contains the "_id" suffixed field instead of the base field, map that too
            const row = this.collection[ndx.rowIndex - 1];
            if (row && !(fieldName in row) && ((fieldName + '_id') in row)) {
                fdt[fieldName + '_id'] = pkValue;
            }
        }
        if (document.querySelector('#index tr.table-active input:checked')) {
            document.querySelectorAll('#index tbody tr input:checked')
                .forEach(n => Object.assign(this.collection[n.closest('tr').rowIndex - 1], fdt));
        }
        else
            Object.assign(this.collection[ndx.rowIndex - 1], fdt);
        this.FieldEdit.hide();
        this.enb_save();
    }
}
export class AdminerEdit extends db_crud {
    constructor() {
        super();
        if (document.getElementById('sel-app')) {
            document.getElementById('sel-app').onchange = (e) => this.setApp(e);
            document.getElementById('app-model').onchange = (e) => this.loadModel(e);
            const path = window.location.pathname;
            const preRendered = document.getElementById('index');
            if (preRendered) {
                const segments = path.split('/').filter(Boolean);
                const braceIdx = segments.findIndex(s => s === '{}' || s === '%7B%7D');
                const mdlIdx = braceIdx > 0 ? braceIdx - 1 : segments.length - 1;
                const appIdx = mdlIdx - 1;
                if (appIdx >= 0 && mdlIdx >= 0) {
                    const app = segments[appIdx];
                    const mdl = segments[mdlIdx];
                    this.href = (path.startsWith('/sastry/') ? '/sastry/' : '/index/') + app + '/' + mdl + '/';
                    const selApp = document.getElementById('sel-app');
                    const appModel = document.getElementById('app-model');
                    if (selApp)
                        selApp.value = app;
                    if (appModel)
                        appModel.value = `${app}_${mdl}`;
                }
                this.setData();
            }
            else if (path === '/sastry/' || path === '/sastry/index/' || path === '/' || path === '/index/') {
                const selApp = document.getElementById('sel-app');
                const appModel = document.getElementById('app-model');
                if (selApp && appModel) {
                    const datalist = document.getElementById('AppMdl');
                    const options = Array.from(selApp.options).map(o => o.value).filter(Boolean);
                    const targetApp = options[0];
                    if (targetApp) {
                        selApp.value = targetApp;
                        const modelOpts = datalist ? Array.from(datalist.options).map(o => o.value) : [];
                        const targetModel = modelOpts.find(v => v.startsWith(targetApp + '_')) || modelOpts[0];
                        if (targetModel) {
                            appModel.value = targetModel;
                            this.loadModel({ target: appModel });
                        }
                    }
                }
            }
        }
    }
    setApp(e) {
        document.getElementById('app-model').value = e.target.value + '_';
        document.getElementById('app-model').focus();
    }
    loadModel(e) {
        let app_mdl = e.target.value;
        if (e.target.tagName == 'A') {
            e.preventDefault();
            app_mdl = e.target.getAttribute('href');
        }
        this.href = (window.location.pathname.startsWith('/sastry/') ? '/sastry/' : '/index/') + app_mdl.replace('_', '/') + '/';
        document.getElementById('content_d').innerHTML = this.spinner;
        fetch(this.href + '{}')
            .then(response => response.text())
            .then(data => {
            document.getElementById('content_d').innerHTML = data;
            this.setData();
        })
            .catch(error => console.error('Error:', error));
    }
}
window.db_crud = db_crud;
window.AdminerEdit = AdminerEdit;
