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
                .then(response => response.text())
                .then(data => {
                alert(data);
                if (data === 'Cleared') {
                    document.querySelector('#SaveAll').classList.add('d-none');
                }
            })
                .catch(error => console.error('Error:', error));
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
            // Default to loading customer_Order automatically if landing on the main /sastry/ page
            const path = window.location.pathname;
            if (path === '/sastry/' || path === '/sastry/index/') {
                const selApp = document.getElementById('sel-app');
                const appModel = document.getElementById('app-model');
                if (selApp && appModel) {
                    selApp.value = 'customer';
                    appModel.value = 'customer_Order';
                    this.loadModel({ target: appModel });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic19jcnVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vZnJvbnRlbmQvc3JjL2NvcmUvdXRpbHMvc19jcnVkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUdBLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV2RCxNQUFNLE9BQU8sT0FBTztJQUNoQixVQUFVLEdBQVEsRUFBRSxDQUFDO0lBRXJCLElBQUksR0FBVyxDQUFDLENBQUM7SUFDakIsSUFBSSxHQUFRLElBQUksQ0FBQztJQUNqQixNQUFNLEdBQVUsRUFBRSxDQUFDO0lBQ25CLElBQUksR0FBa0IsSUFBSSxDQUFDO0lBQzNCLElBQUksR0FBa0IsSUFBSSxDQUFDO0lBQzNCLFNBQVMsR0FBWSxLQUFLLENBQUM7SUFDM0IsR0FBRyxHQUFrQixJQUFJLENBQUM7SUFDMUIsUUFBUSxHQUFhLEVBQUUsQ0FBQztJQUN4QixPQUFPLENBQVM7SUFDaEIsSUFBSSxHQUFRLElBQUksQ0FBQztJQUNqQixJQUFJLEdBQWtCLElBQUksQ0FBQztJQUMzQixNQUFNLEdBQVEsRUFBRSxDQUFDO0lBQ2pCLFFBQVEsR0FBWSxLQUFLLENBQUM7SUFDMUIsT0FBTyxHQUFRLEVBQUUsQ0FBQztJQUNsQixTQUFTLEdBQVEsSUFBSSxDQUFDO0lBRXRCO1FBQ0ksSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDZCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQztRQUNqQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQztRQUNo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QUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQ3hELENBQUM7Q0FDSjtBQUNBLE1BQWMsQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO0FBQ2pDLE1BQWMsQ0FBQyxXQUFXLEdBQUcsV0FBVyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiXG5cblxuaW1wb3J0IHsgcG9zdFdpdGhDc3JmIH0gZnJvbSAnLi4vbW9kdWxlcy9kb20tdXRpbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgZGJfY3J1ZDxUIGV4dGVuZHMgeyBpZD86IHN0cmluZyB8IG51bWJlciwgW2tleTogc3RyaW5nXTogYW55IH0gPSBhbnk+IHtcbiAgICBjb2xsZWN0aW9uOiBUW10gPSBbXTtcblxuICAgIHhwb3M6IG51bWJlciA9IDA7XG4gICAgbGt1cDogYW55ID0gbnVsbDtcbiAgICBmaWVsZHM6IGFueVtdID0gW107XG4gICAgaHJlZjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgZm9ybTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gICAgbW9kaWZpZmVkOiBib29sZWFuID0gZmFsc2U7XG4gICAgbmR4OiBudW1iZXIgfCBudWxsID0gbnVsbDtcbiAgICBzZWxfcm93czogbnVtYmVyW10gPSBbXTtcbiAgICBzcGlubmVyOiBzdHJpbmc7XG4gICAgdG1wbDogYW55ID0gbnVsbDtcbiAgICBjc3JmOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcbiAgICBmaWx0ZXI6IGFueSA9IHt9O1xuICAgIEZpbHRlck9SOiBib29sZWFuID0gZmFsc2U7XG4gICAgZXhjbHVkZTogYW55ID0ge307XG4gICAgRmllbGRFZGl0OiBhbnkgPSBudWxsO1xuXG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMuY29sbGVjdGlvbiA9IFtdO1xuICAgICAgICB0aGlzLnhwb3MgPSAwO1xuICAgICAgICB0aGlzLmxrdXAgPSBudWxsO1xuICAgICAgICB0aGlzLmZpZWxkcyA9IFtdO1xuICAgICAgICB0aGlzLmhyZWYgPSBudWxsO1xuICAgICAgICB0aGlzLmZvcm0gPSBudWxsO1xuICAgICAgICB0aGlzLm1vZGlmaWZlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLm5keCA9IG51bGw7XG4gICAgICAgIHRoaXMuc2VsX3Jvd3MgPSBbXTtcbiAgICAgICAgdGhpcy5zcGlubmVyID0gJzxkaXYgY2xhc3M9XCJkLWZsZXgganVzdGlmeS1jb250ZW50LWNlbnRlclwiPjxkaXYgY2xhc3M9XCJzcGlubmVyLWJvcmRlclwiIHJvbGU9XCJzdGF0dXNcIj4nICtcbiAgICAgICAgICAgICc8c3BhbiBjbGFzcz1cInNyLW9ubHlcIj5Mb2FkaW5nLi4uPC9zcGFuPjwvZGl2PjwvZGl2ID4nO1xuICAgICAgICB0aGlzLnRtcGwgPSBudWxsO1xuICAgICAgICB0aGlzLmNzcmYgPSBudWxsO1xuICAgICAgICBpZiAoZG9jdW1lbnQuY29va2llICYmIGRvY3VtZW50LmNvb2tpZSAhPT0gJycpXG4gICAgICAgICAgICB0aGlzLmNzcmYgPSBkb2N1bWVudC5jb29raWUuc3BsaXQoJz0nKVsxXTtcbiAgICAgICAgY29uc3Qgc2J0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdTYXZlQWxsJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgICAgIGlmIChzYnRuKSB7XG4gICAgICAgICAgICBjb25zdCBvYnNlcnZlciA9IG5ldyBNdXRhdGlvbk9ic2VydmVyKCgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoc2J0bi5kaXNhYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICBzYnRuLmNsYXNzTGlzdC5yZW1vdmUoJ2J0bi1kYW5nZXInKTtcbiAgICAgICAgICAgICAgICAgICAgc2J0bi5jbGFzc0xpc3QuYWRkKCdidG4tb3V0bGluZS1kYW5nZXInKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzYnRuLmNsYXNzTGlzdC5yZW1vdmUoJ2J0bi1vdXRsaW5lLWRhbmdlcicpO1xuICAgICAgICAgICAgICAgICAgICBzYnRuLmNsYXNzTGlzdC5hZGQoJ2J0bi1kYW5nZXInKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIG9ic2VydmVyLm9ic2VydmUoc2J0biwgeyBhdHRyaWJ1dGVzOiB0cnVlLCBhdHRyaWJ1dGVGaWx0ZXI6IFsnZGlzYWJsZWQnXSB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBzZXREYXRhKCkge1xuICAgICAgICBpZiAoIXRoaXMuZmlsdGVyIHx8IE9iamVjdC5rZXlzKHRoaXMuZmlsdGVyKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIHRoaXMuZmlsdGVyID0gSlNPTi5wYXJzZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnQXBwbHlGaWx0ZXInKSEuZ2V0QXR0cmlidXRlKCdkYXRhLWZpbHRlcicpIHx8ICd7fScpO1xuICAgICAgICAgICAgdGhpcy5GaWx0ZXJPUiA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnRmlsdGVyT1InKSBhcyBIVE1MSW5wdXRFbGVtZW50KS5jaGVja2VkO1xuICAgICAgICAgICAgdGhpcy5leGNsdWRlID0gSlNPTi5wYXJzZShkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnQXBwbHlGaWx0ZXInKSEuZ2V0QXR0cmlidXRlKCdkYXRhLWV4Y2x1ZGUnKSB8fCAne30nKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmhyZWYgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3J1X2Zvcm0nKSEuZ2V0QXR0cmlidXRlKCdhY3Rpb24nKTtcbiAgICAgICAgdGhpcy5jb2xsZWN0aW9uID0gSlNPTi5wYXJzZSgoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2luZGV4IHRib2R5JykgYXMgSFRNTEVsZW1lbnQpLmRhdGFzZXQucm93cyB8fCAnW10nKTtcbiAgICAgICAgdGhpcy5maWVsZHMgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNpbmRleCB0aCcpKS5tYXAoeCA9PiB7XG4gICAgICAgICAgICBsZXQgZGF0OiBhbnlbXSA9ICh4LmdldEF0dHJpYnV0ZSgnZGF0YS1jb2wnKSB8fCAnJykuc3BsaXQoJywnKTtcbiAgICAgICAgICAgIGRhdFsyXSA9IGRhdFsyXS50b0xvd2VyQ2FzZSgpID09ICd0cnVlJztcbiAgICAgICAgICAgIGRhdC5wdXNoKHguY2xhc3NMaXN0LmNvbnRhaW5zKCdkLW5vbmUnKSk7XG4gICAgICAgICAgICByZXR1cm4gZGF0O1xuICAgICAgICB9KTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ0hpZGVDb2x1bW5zJykhLmlubmVySFRNTCA9IHRoaXMuZmllbGRzLnNsaWNlKDEpLnJlZHVjZSgoaXYsIGN2LCBuZHgpID0+IHtcbiAgICAgICAgICAgIGxldCB2YWwgPSBjdlswXTtcbiAgICAgICAgICAgIGlmICh2YWwuZW5kc1dpdGgoJ19pZCcpKVxuICAgICAgICAgICAgICAgIHZhbCA9IHZhbC5zbGljZSgwLCAtMyk7XG4gICAgICAgICAgICB2YWwgPSB2YWwucmVwbGFjZUFsbCgnXycsICcgJyk7XG4gICAgICAgICAgICByZXR1cm4gKGl2ICsgJzxkaXYgY2xhc3M9XCJmb3JtLWNoZWNrXCI+JyArXG4gICAgICAgICAgICAgICAgYDxpbnB1dCBjbGFzcz1cImZvcm0tY2hlY2staW5wdXRcIiB0eXBlPVwiY2hlY2tib3hcIiB2YWx1ZT1cIiR7MiArIG5keH1cIiAke2N2WzNdID8gJyBjaGVja2VkJyA6ICcnfT5gICtcbiAgICAgICAgICAgICAgICBgPGxhYmVsIGNsYXNzPVwiZm9ybS1jaGVjay1sYWJlbCB0ZXh0LWNhcGl0YWxpemVcIiBmb3I9XCJmbGV4Q2hlY2tEZWZhdWx0XCI+JHt2YWx9PC9sYWJlbD48L2Rpdj5gKTtcbiAgICAgICAgfSwgJycpO1xuICAgICAgICB0aGlzLmxrdXAgPSBPYmplY3QuZnJvbUVudHJpZXMoQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjY3J1X2Zvcm0gZGF0YWxpc3QnKSlcbiAgICAgICAgICAgIC5tYXAocyA9PiBbcy5pZC5zbGljZSgyKSwgT2JqZWN0LmZyb21FbnRyaWVzKEFycmF5LmZyb20ocy5xdWVyeVNlbGVjdG9yQWxsKCdvcHRpb24nKSlcbiAgICAgICAgICAgICAgICAubWFwKChvOiBhbnkpID0+IFtvLmRhdGFzZXQucGssIG8udmFsdWVdKSldKSk7XG4gICAgICAgIHRoaXMueHBvcyA9IC0xO1xuICAgICAgICBjb25zdCBjZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcnVfZm9ybScpITtcbiAgICAgICAgdGhpcy5mb3JtID0gY2YuaW5uZXJIVE1MO1xuICAgICAgICB0aGlzLnNlbF9yb3dzID0gW107XG4gICAgICAgIHRoaXMucmVuZGVyKCk7XG4gICAgfVxuICAgIHJlbmRlcigpIHtcbiAgICAgICAgdGhpcy5TaG93VGFiKCdpbmRleCcpO1xuICAgICAgICBsZXQgcGFnZV9udW0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnUGFnZU51bScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGNvbnN0IG5fcGFnZXMgPSBwYXJzZUludChwYWdlX251bS5nZXRBdHRyaWJ1dGUoJ21heCcpIHx8ICcwJyk7XG4gICAgICAgIGNvbnN0IG5fcm93cyA9IHBhcnNlSW50KHBhZ2VfbnVtLmdldEF0dHJpYnV0ZSgnZGF0YS1ucm93cycpIHx8ICcwJyk7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduX3BhZ2VzJykhLnRleHRDb250ZW50ID0gJ29mICcgKyBuX3BhZ2VzICsgKG5fcGFnZXMgPiAxID8gJyBQYWdlcycgOiAnJyk7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCduX3Jvd3MnKSEudGV4dENvbnRlbnQgPSBuX3Jvd3MgKyAnIFJvdycgKyAobl9yb3dzID4gMSA/ICdzJyA6ICcnKTtcbiAgICAgICAgbGV0IHBudW0gPSBwYXJzZUludChwYWdlX251bS52YWx1ZSk7XG4gICAgICAgIGlmIChwbnVtID4gMTApXG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncm93c19wcF9tMicpIS5jbGFzc0xpc3QucmVtb3ZlKCdkLW5vbmUnKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jvd3NfcHBfbTInKSEuY2xhc3NMaXN0LmFkZCgnZC1ub25lJyk7XG4gICAgICAgIGlmIChwbnVtICsgMTAgPCBuX3BhZ2VzKVxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jvd3NfcHBfcDInKSEuY2xhc3NMaXN0LnJlbW92ZSgnZC1ub25lJyk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb3dzX3BwX3AyJykhLmNsYXNzTGlzdC5hZGQoJ2Qtbm9uZScpO1xuXG4gICAgICAgIHRoaXMubmR4ID0gbnVsbDtcbiAgICAgICAgdGhpcy50Ym9keVJlbmRlcigpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3Bpbm5lcicpIS5pbm5lckhUTUwgPSAnJztcbiAgICAgICAgbGV0IGl0YmwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5kZXgtdGFibGUnKSE7XG4gICAgICAgIGlmICh0aGlzLnhwb3MgPCAwKSB7XG4gICAgICAgICAgICB0aGlzLnhwb3MgPSAwO1xuICAgICAgICAgICAgaWYgKGl0YmwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkud2lkdGggPiB3aW5kb3cuaW5uZXJXaWR0aClcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdtYWluJykhLmNsYXNzTGlzdC5yZW1vdmUoJ2NvbnRhaW5lcicpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ21haW4nKSEuY2xhc3NMaXN0LmFkZCgnY29udGFpbmVyJyk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSBpdGJsLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCAtXG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdmb290ZXInKSEub2Zmc2V0SGVpZ2h0IC0gOCArICdweCc7XG4gICAgICAgIGl0YmwucGFyZW50RWxlbWVudCEuc3R5bGUuaGVpZ2h0ID0gaHQ7XG5cbiAgICAgICAgaXRibC5zY3JvbGxMZWZ0ID0gdGhpcy54cG9zO1xuICAgICAgICB0aGlzLnNldEljb24oKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ1BhZ2VOdW0nKSEub25rZXl1cCA9IChlOiBhbnkpID0+IHRoaXMuUGFnZU51bUtleVVwKGUpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnUGFnZU51bScpIS5vbmNoYW5nZSA9IChlOiBhbnkpID0+IHRoaXMubG9hZFBhZ2VOdW0oZSk7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb3dzX3BwJykhLm9ua2V5dXAgPSAoZTogYW55KSA9PiB0aGlzLlJvd1BQX0tleVVwKGUpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncm93c19wcCcpIS5vbmNoYW5nZSA9IChlOiBhbnkpID0+IHRoaXMuY2hhbmdlUm93c1BQKGUpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3JkZXJfYnknKSEub25jaGFuZ2UgPSAoZTogYW55KSA9PiB0aGlzLmxvYWRQYWdlTnVtKGUpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0X3Jvd3NfcHAnKSEub25jbGljayA9IChlOiBhbnkpID0+IHRoaXMuY2hhbmdlUm93c1BQKGUpO1xuXG4gICAgICAgIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCd0aCBpbnB1dCcpIGFzIEhUTUxFbGVtZW50KS5vbmNoYW5nZSA9IChlOiBhbnkpID0+IHRoaXMuc2V0UmVzZXRBbGwoZSk7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb3dzX3BwX3AyJykhLm9uY2xpY2sgPSAoZTogYW55KSA9PiB0aGlzLmNoYW5nZVJvd3NQTTEwKGUpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncm93c19wcF9tMicpIS5vbmNsaWNrID0gKGU6IGFueSkgPT4gdGhpcy5jaGFuZ2VSb3dzUE0xMChlKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbS1leHAnKSEub25jbGljayA9IChlOiBhbnkpID0+IHRoaXMuc2V0TWFpbihlKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ29yZGVyX2RpcicpIS5vbmNsaWNrID0gKGU6IGFueSkgPT4gdGhpcy5jaGFuZ2VEaXIoZSk7XG4gICAgICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZWRpdCcpKVxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2VkaXQnKSEub25jbGljayA9IChlOiBhbnkpID0+IHRoaXMuc2V0RWRpdChlKTtcbiAgICAgICAgaWYgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhZGQtcmVjb3JkJykpXG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYWRkLXJlY29yZCcpIS5vbmNsaWNrID0gKGU6IGFueSkgPT4gdGhpcy5zZXRFZGl0KGUpO1xuICAgICAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldEZpbHRlcicpKVxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldEZpbHRlcicpIS5vbmNsaWNrID0gKGU6IGFueSkgPT4gdGhpcy5zaG93Q3J1RmlsdGVyKGUpO1xuICAgICAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ1NhdmVBbGwnKSlcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdTYXZlQWxsJykhLm9uY2xpY2sgPSAoZTogYW55KSA9PiB0aGlzLlNhdmVSZWNvcmRzKGUpO1xuICAgICAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlbC1yZWNvcmQnKSlcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkZWwtcmVjb3JkJykhLm9uY2xpY2sgPSAoZTogYW55KSA9PiB0aGlzLkRlbGV0ZVJlY29yZHMoZSk7XG4gICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHBseV9oaWRlJykhLm9uY2xpY2sgPSAoZTogYW55KSA9PiB0aGlzLmhpZGVfY29sdW1ucyhlKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2hpZGUtYWxsJykhLm9uY2xpY2sgPSAoZTogYW55KSA9PiB0aGlzLnNldF9oaWRlKGUpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZG93bmxvYWQnKSEub25jbGljayA9IChlOiBhbnkpID0+IHRoaXMuZG93bmxvYWQoZSk7XG4gICAgICAgIHZhciB0b29sdGlwVHJpZ2dlckxpc3QgPSBBcnJheS5mcm9tKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWJzLXRvZ2dsZT1cInRvb2x0aXBcIl0nKSk7XG4gICAgICAgIHZhciB0b29sdGlwTGlzdCA9IHRvb2x0aXBUcmlnZ2VyTGlzdC5tYXAoZnVuY3Rpb24gKHRvb2x0aXBUcmlnZ2VyRWwpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXcgYm9vdHN0cmFwLlRvb2x0aXAodG9vbHRpcFRyaWdnZXJFbCk7XG4gICAgICAgIH0pO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0SW5kZXgnKSEub25jbGljayA9ICgpID0+IHRoaXMuU2hvd1RhYignaW5kZXgnKTtcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ1Nob3dFeHRyYURldGFpbCcpIS5vbmNsaWNrID0gKCkgPT4gdGhpcy5TaG93VGFiKCdFeHRyYURldGFpbCcpO1xuICAgICAgICBjb25zdCBmZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdGaWVsZEVkaXQnKTtcbiAgICAgICAgaWYgKGZlKSB7XG4gICAgICAgICAgICAoZmUucXVlcnlTZWxlY3RvcignLm1vZGFsLWZvb3RlciBidXR0b24uYnRuLXByaW1hcnknKSBhcyBIVE1MRWxlbWVudCkub25jbGljayA9IChlOiBhbnkpID0+IHRoaXMuY2VsbFNhdmUoZSk7XG4gICAgICAgICAgICB0aGlzLkZpZWxkRWRpdCA9IG5ldyBib290c3RyYXAuTW9kYWwoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ0ZpZWxkRWRpdCcpISk7XG4gICAgICAgICAgICBmZS5hZGRFdmVudExpc3RlbmVyKCdoaWRkZW4uYnMubW9kYWwnLCAoKSA9PiBmZS5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJykpO1xuICAgICAgICB9XG4gICAgfVxuICAgIFNob3dUYWIodzogc3RyaW5nKSB7XG4gICAgICAgIGxldCBlbGUgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjY29udGVudCAuY29sbGFwc2Uuc2hvdycpO1xuICAgICAgICBpZiAoZWxlKSB7XG4gICAgICAgICAgICBpZiAoZWxlLmlkID09IHcpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZWxlLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3cnKTtcbiAgICAgICAgfVxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCh3KSEuY2xhc3NMaXN0LmFkZCgnc2hvdycpO1xuICAgIH1cbiAgICBQYWdlTnVtS2V5VXAoZTogYW55KSB7XG4gICAgICAgIGlmIChlLmtleUNvZGUgPT0gMTMpXG4gICAgICAgICAgICB0aGlzLmxvYWRQYWdlTnVtKCk7XG4gICAgfVxuICAgIFJvd1BQX0tleVVwKGU6IGFueSkge1xuICAgICAgICBpZiAoZS5rZXlDb2RlID09IDEzKVxuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NldF9yb3dzX3BwJykhLmNsaWNrKCk7XG4gICAgfVxuICAgIGNoYW5nZVJvd3NQTTEwKGU6IGFueSkge1xuICAgICAgICBsZXQgZWxlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ1BhZ2VOdW0nKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBsZXQgdGd0ID0gZS50YXJnZXQudGFnTmFtZSA9PSAnSScgPyBlLnRhcmdldC5wYXJlbnRFbGVtZW50IDogZS50YXJnZXQ7XG4gICAgICAgIGxldCBudmFsID0gcGFyc2VJbnQoZWxlLnZhbHVlKSArIHBhcnNlSW50KHRndC5nZXRBdHRyaWJ1dGUoJ2RhdGEtbW9kJykpO1xuICAgICAgICBsZXQgbWF4ID0gcGFyc2VJbnQoZWxlLmdldEF0dHJpYnV0ZSgnbWF4JykgfHwgJzAnKTtcbiAgICAgICAgbGV0IG1pbiA9IHBhcnNlSW50KGVsZS5nZXRBdHRyaWJ1dGUoJ21pbicpIHx8ICcwJyk7XG4gICAgICAgIGlmIChudmFsIDw9IG1heCAmJiBudmFsID49IG1pbikge1xuICAgICAgICAgICAgZWxlLnZhbHVlID0gbnZhbC50b1N0cmluZygpO1xuICAgICAgICAgICAgdGhpcy5sb2FkUGFnZU51bSgpO1xuICAgICAgICB9XG4gICAgfVxuICAgIGhpZGVfY29sdW1ucyhlOiBhbnkpIHtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm9mZmNhbnZhcy1ib2R5IGlucHV0JykuZm9yRWFjaCgoeDogYW55KSA9PiB7XG4gICAgICAgICAgICBsZXQgdGggPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGB0aGVhZCB0aDpudGgtY2hpbGQoJHt4LnZhbHVlfSlgKSE7XG4gICAgICAgICAgICBpZiAoeC5jaGVja2VkICE9IHRoLmNsYXNzTGlzdC5jb250YWlucygnZC1ub25lJykpIHtcbiAgICAgICAgICAgICAgICBsZXQgdGQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGAjaW5kZXggdGJvZHkgdHIgdGQ6bnRoLWNoaWxkKCR7eC52YWx1ZX0pYCk7XG4gICAgICAgICAgICAgICAgaWYgKHguY2hlY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aC5jbGFzc0xpc3QuYWRkKCdkLW5vbmUnKTtcbiAgICAgICAgICAgICAgICAgICAgdGQuZm9yRWFjaCh5ID0+IHkuY2xhc3NMaXN0LmFkZCgnZC1ub25lJykpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoLmNsYXNzTGlzdC5yZW1vdmUoJ2Qtbm9uZScpO1xuICAgICAgICAgICAgICAgICAgICB0ZC5mb3JFYWNoKHkgPT4geS5jbGFzc0xpc3QucmVtb3ZlKCdkLW5vbmUnKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgc2V0X2hpZGUoZTogYW55KSB7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5vZmZjYW52YXMtYm9keSBpbnB1dCcpLmZvckVhY2goKHg6IGFueSkgPT4geC5jaGVja2VkID0gZS50YXJnZXQuY2hlY2tlZCk7XG4gICAgfVxuICAgIHRib2R5UmVuZGVyKCkge1xuICAgICAgICBjb25zdCB0Ym9keSA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbmRleCB0Ym9keScpITtcbiAgICAgICAgdGJvZHkuaW5uZXJIVE1MID0gJyc7XG4gICAgICAgIGNvbnN0IGhpZGVDb2x1bW5zID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcub2ZmY2FudmFzLWJvZHkgaW5wdXQ6Y2hlY2tlZCcpKS5tYXAoKHg6IGFueSkgPT4gcGFyc2VJbnQoeC52YWx1ZSkpO1xuICAgICAgICBjb25zdCB0YiA9IHRib2R5OyAvLyBSZWZlcmVuY2UgdG8gdGJvZHkgZm9yIGFwcGVuZGluZyByb3dzXG5cbiAgICAgICAgdGhpcy5jb2xsZWN0aW9uLmZvckVhY2goKHJvdywgY291bnQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcbiAgICAgICAgICAgIHRoaXMuZmllbGRzLmZvckVhY2goKGZpZWxkLCBpbmRleCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndGQnKTtcbiAgICAgICAgICAgICAgICBpZiAoaGlkZUNvbHVtbnMuaW5jbHVkZXMoaW5kZXggKyAxKSkgdGQuY2xhc3NMaXN0LmFkZCgnZC1ub25lJyk7XG4gICAgICAgICAgICAgICAgbGV0IHR4dCA9IHJvd1tmaWVsZFswXV07XG5cbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGZpZWxkWzFdKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ0ZvcmVpZ25LZXknOlxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3RmllbGQgPSBmaWVsZFswXS5lbmRzV2l0aCgnX2lkJykgPyBmaWVsZFswXS5zbGljZSgwLCAtMykgOiBmaWVsZFswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZrTGt1cCA9ICh0aGlzLmxrdXAgJiYgKHRoaXMubGt1cFtmaWVsZFswXV0gfHwgdGhpcy5sa3VwW3Jhd0ZpZWxkXSB8fCB0aGlzLmxrdXBbYCR7cmF3RmllbGR9X2lkYF0pKSB8fCBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGQuZGF0YXNldC52YWwgPSB0eHQgIT0gbnVsbCA/IFN0cmluZyh0eHQpIDogJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZC50ZXh0Q29udGVudCA9ICh0eHQgIT0gbnVsbCAmJiB0eHQgIT09ICcnICYmIGZrTGt1cCAmJiBma0xrdXBbdHh0XSAhPSBudWxsKSA/IGZrTGt1cFt0eHRdIDogKHR4dCAhPSBudWxsICYmIHR4dCAhPT0gJ251bGwnID8gU3RyaW5nKHR4dCkgOiAnJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnSW50ZWdlckZpZWxkJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRkLnRleHRDb250ZW50ID0gdHh0O1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnQm9vbGVhbkZpZWxkJzpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnTnVsbEJvb2xlYW5GaWVsZCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGVja2VkID0gdHh0ID09IHRydWUgfHwgdHh0ID09PSAnVHJ1ZScgfHwgdHh0ID09PSAndHJ1ZSc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZC5kYXRhc2V0LnZhbCA9IFN0cmluZyhjaGVja2VkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRkLmlubmVySFRNTCA9IGNoZWNrZWQgPyAnPGkgY2xhc3M9XCJiaSBiaS1jaGVjay1sZ1wiPjwvaT4nIDogJzxpIGNsYXNzPVwiYmkgYmkteFwiPjwvaT4nO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ0ltYWdlRmllbGQnOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGQuZGF0YXNldC52YWwgPSB0eHQgfHwgJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZC5kYXRhc2V0Lm5hbWUgPSBmaWVsZFswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdHh0ID09PSAnc3RyaW5nJyAmJiB0eHQuc3RhcnRzV2l0aCgnL21lZGlhL21lZGlhLycpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHR4dCA9IHR4dC5zbGljZSg2KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGltZ1NyYyA9ICh0eHQgJiYgdHh0ICE9PSAnbnVsbCcgJiYgdHlwZW9mIHR4dCA9PT0gJ3N0cmluZycpID8gdHh0IDogJy9tZWRpYS9kdW1teS5qcGcnO1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGVpZ2h0ID0gIXR4dCB8fCB0eHQgPT09ICdudWxsJyB8fCBTdHJpbmcodHh0KS5pbmNsdWRlcygnZHVtbXknKSA/IDEgOiA1O1xuICAgICAgICAgICAgICAgICAgICAgICAgdGQuaW5uZXJIVE1MID0gYDxpbWcgc3JjPVwiJHtpbWdTcmN9XCIgb25lcnJvcj1cInRoaXMub25lcnJvcj1udWxsOyB0aGlzLnNyYz0nL21lZGlhL2R1bW15LmpwZyc7IHRoaXMuc3R5bGUuaGVpZ2h0PScxcmVtJztcIiBhbHQ9XCJObyBJbWFnZVwiIHN0eWxlPVwid2lkdGg6YXV0bzsgbWF4LXdpZHRoOjkwJTsgaGVpZ2h0OiR7aGVpZ2h0fXJlbVwiPmA7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnRGF0ZVRpbWVGaWVsZCc6XG4gICAgICAgICAgICAgICAgICAgICAgICB0ZC50ZXh0Q29udGVudCA9IHR4dCA/IHR4dC5zbGljZSgwLCAxMCkgOiAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYmFzZUZpZWxkID0gZmllbGRbMF0uZW5kc1dpdGgoJ19pZCcpID8gZmllbGRbMF0uc2xpY2UoMCwgLTMpIDogZmllbGRbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBnZW5Ma3VwID0gKHRoaXMubGt1cCAmJiAodGhpcy5sa3VwW2ZpZWxkWzBdXSB8fCB0aGlzLmxrdXBbYmFzZUZpZWxkXSB8fCB0aGlzLmxrdXBbYCR7YmFzZUZpZWxkfV9pZGBdKSkgfHwgbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmaWVsZFswXSA9PT0gJ2NoaycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZC5pbm5lckhUTUwgPSBgPGlucHV0IHR5cGU9XCJjaGVja2JveFwiIHN0eWxlPVwid2lkdGg6MnJlbTsgaGVpZ2h0OjFyZW1cIiR7dGhpcy5zZWxfcm93cy5pbmNsdWRlcyhjb3VudCkgPyAnIGNoZWNrZWQnIDogJyd9Lz5gO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChnZW5Ma3VwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGQuZGF0YXNldC52YWwgPSB0eHQgIT0gbnVsbCA/IFN0cmluZyh0eHQpIDogJyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGQudGV4dENvbnRlbnQgPSAodHh0ICE9IG51bGwgJiYgdHh0ICE9PSAnJyAmJiBnZW5Ma3VwW3R4dF0gIT0gbnVsbCkgPyBnZW5Ma3VwW3R4dF0gOiAodHh0ICE9IG51bGwgJiYgdHh0ICE9PSAnbnVsbCcgPyBTdHJpbmcodHh0KSA6ICcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdHh0ID0gdHh0ICYmIHR4dCAhPT0gJ251bGwnID8gKHR5cGVvZiB0eHQgPT09ICdvYmplY3QnID8gSlNPTi5zdHJpbmdpZnkodHh0KSA6IHR4dCkgOiAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0ZC50ZXh0Q29udGVudCA9IHR4dCB8fCAnJztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyLmFwcGVuZENoaWxkKHRkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgdGIuYXBwZW5kQ2hpbGQodHIpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBpbmRleEVsZW0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaW5kZXgnKSE7XG4gICAgICAgIGluZGV4RWxlbS5xdWVyeVNlbGVjdG9yQWxsKCd0ciB0ZDpub3QoOmZpcnN0LWNoaWxkKScpLmZvckVhY2goKGNlbGw6IGFueSkgPT4gY2VsbC5vbmNsaWNrID0gKGU6IGFueSkgPT4gdGhpcy5jZWxsRWRpdChlKSk7XG4gICAgICAgIGluZGV4RWxlbS5xdWVyeVNlbGVjdG9yQWxsKCd0ciB0ZDpudGgtb2YtdHlwZSgxKScpLmZvckVhY2goKGNlbGw6IGFueSkgPT4gY2VsbC5vbmNsaWNrID0gKGU6IGFueSkgPT4gdGhpcy5yb3dTZWxlY3QoZSkpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0SW5kZXgnKSEuY2xpY2soKTtcbiAgICAgICAgaW5kZXhFbGVtLnN0eWxlLm1heEhlaWdodCA9IGAke3dpbmRvdy5pbm5lckhlaWdodCAtIGluZGV4RWxlbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3B9cHhgO1xuXG4gICAgICAgIGNvbnN0IGZpcnN0Um93ID0gdGJvZHkucXVlcnlTZWxlY3RvcigndHInKTtcbiAgICAgICAgaWYgKGZpcnN0Um93KSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMubmR4KSB0aGlzLm5keCA9IDE7XG4gICAgICAgICAgICAodGJvZHkucXVlcnlTZWxlY3RvcihgdHI6bnRoLWNoaWxkKCR7dGhpcy5uZHh9KSB0ZDpudGgtY2hpbGQoMylgKSBhcyBIVE1MRWxlbWVudCkuY2xpY2soKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJvd1NlbGVjdChlOiBhbnkpIHtcbiAgICAgICAgbGV0IHRyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2luZGV4IHRib2R5IHRyLnRhYmxlLWFjdGl2ZScpIGFzIGFueTtcbiAgICAgICAgaWYgKHRyKVxuICAgICAgICAgICAgdHIuY2xhc3NMaXN0LnJlbW92ZSgndGFibGUtYWN0aXZlJyk7XG4gICAgICAgIHRyID0gZS50YXJnZXQuY2xvc2VzdCgndHInKTtcbiAgICAgICAgbGV0IG5keCA9IHRyLnJvd0luZGV4IC0gMTtcbiAgICAgICAgaWYgKHRoaXMuc2VsX3Jvd3MuaW5jbHVkZXMobmR4KSkge1xuICAgICAgICAgICAgdGhpcy5zZWxfcm93cy5zcGxpY2UodGhpcy5zZWxfcm93cy5pbmRleE9mKHRyLnJvd0luZGV4IC0gMSksIDEpO1xuICAgICAgICAgICAgdHIucXVlcnlTZWxlY3RvcignaW5wdXQnKS5jaGVja2VkID0gZmFsc2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNlbF9yb3dzLnB1c2gobmR4KTtcbiAgICAgICAgICAgIHRyLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykuY2hlY2tlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0ci5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpLmNoZWNrZWQpIHtcbiAgICAgICAgICAgIHRyID0gIXRoaXMuc2VsX3Jvd3MubGVuZ3RoID8gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2luZGV4IHRib2R5IHRyOmZpcnN0LWNoaWxkJykgOlxuICAgICAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYCNpbmRleCB0Ym9keSB0cjpudGgtb2YtdHlwZSgkezEgKyBNYXRoLm1pbi5hcHBseShudWxsLCB0aGlzLnNlbF9yb3dzKX0pYCk7XG4gICAgICAgIH1cbiAgICAgICAgKHRyIGFzIEhUTUxFbGVtZW50KS5jbGFzc0xpc3QuYWRkKCd0YWJsZS1hY3RpdmUnKTtcbiAgICB9XG4gICAgdHJTZXRTZWxlY3RlZCh0cjogSFRNTFRhYmxlUm93RWxlbWVudCkge1xuICAgICAgICB0aGlzLm5keCA9IHRyLnJvd0luZGV4IC0gMTtcbiAgICAgICAgdHIuY2xhc3NMaXN0LmFkZCgndGFibGUtYWN0aXZlJyk7XG4gICAgICAgIGlmIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZWRpdCcpKVxuICAgICAgICAgICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlZGl0JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQpLmRpc2FibGVkID0gZmFsc2U7XG4gICAgfVxuICAgIERlbGV0ZVJlY29yZHMoZTogYW55KSB7XG4gICAgICAgIGNvbnN0IHRyYyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNpbmRleCB0Ym9keSB0ciBpbnB1dDpjaGVja2VkJyk7XG4gICAgICAgIGlmICghdHJjLmxlbmd0aCkge1xuICAgICAgICAgICAgYWxlcnQoJ05vdGhpbmcgU2VsZWN0ZWRcXHJcXG5DaGVjayB0aGUgYm94Jyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgbmR4ID0gQXJyYXkuZnJvbSh0cmMpLm1hcChuID0+IChuLmNsb3Nlc3QoJ3RyJykgYXMgSFRNTFRhYmxlUm93RWxlbWVudCkucm93SW5kZXgpO1xuICAgICAgICBpZiAoIWNvbmZpcm0oYERlbGV0ZSAke25keC5sZW5ndGh9IFJlY29yZCR7bmR4Lmxlbmd0aCA+IDEgPyAncz8nIDogJz8nfWApKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgbmR4LnNvcnQoKGEsIGIpID0+IGIgLSBhKS5mb3JFYWNoKG4gPT4ge1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aW9uLnNwbGljZShuIC0gMSwgMSk7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGAjaW5kZXggdGJvZHkgdHI6bnRoLWNoaWxkKCR7bn0pYCkhLnJlbW92ZSgpO1xuICAgICAgICB9KTtcbiAgICAgICAgY29uc3Qgd2FybmluZ1JvdyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbmRleCB0ci50YWJsZS1hY3RpdmUnKTtcbiAgICAgICAgaWYgKHdhcm5pbmdSb3cpIHdhcm5pbmdSb3cuY2xhc3NMaXN0LnJlbW92ZSgndGFibGUtYWN0aXZlJyk7XG4gICAgICAgIC8vZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlbC1yZWNvcmQnKS5kaXNhYmxlZCA9IHRydWU7XG4gICAgICAgIHRoaXMuc2VsX3Jvd3MgPSBbXTtcbiAgICAgICAgdGhpcy5zZXRTZWxDb3VudCgpO1xuICAgICAgICB0aGlzLmVuYl9zYXZlKCk7XG4gICAgICAgIC8qY29uc3QgdG9vbHRpcElkID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RlbC1yZWNvcmQnKS5nZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpYmVkYnknKTtcbiAgICAgICAgaWYgKHRvb2x0aXBJZCkge1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodG9vbHRpcElkKS5jbGFzc0xpc3QucmVtb3ZlKCdzaG93Jyk7XG4gICAgICAgIH0qL1xuICAgIH1cbiAgICBTYXZlUmVjb3JkcyhlPzogYW55KSB7XG4gICAgICAgIGNvbnN0IG9yaWcgPSBKU09OLnBhcnNlKGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbmRleCB0Ym9keScpIS5nZXRBdHRyaWJ1dGUoJ2RhdGEtcm93cycpIHx8ICdbXScpO1xuICAgICAgICBjb25zdCBvcmcgPSBPYmplY3QuZnJvbUVudHJpZXMob3JpZy5tYXAoKHg6IGFueSkgPT4gW3guaWQsIHhdKSk7XG4gICAgICAgIGNvbnN0IGN1ZDogYW55ID0ge307XG4gICAgICAgIGxldCBjbnQgPSAwLCBtb2RfY250ID0gMDtcbiAgICAgICAgY29uc3QgY2hrX2RlbDogYW55ID0ge307XG5cbiAgICAgICAgdGhpcy5jb2xsZWN0aW9uLmZvckVhY2goeCA9PiB7XG4gICAgICAgICAgICBpZiAoeC5pZCEgaW4gb3JnKSB7XG4gICAgICAgICAgICAgICAgaWYgKE9iamVjdC5lbnRyaWVzKHggYXMgYW55KS5zb21lKChbaywgdl0pID0+IEpTT04uc3RyaW5naWZ5KHYpICE9PSBKU09OLnN0cmluZ2lmeShvcmdbeC5pZCFdW2tdKSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY3VkW3guaWQhXSA9IHg7XG4gICAgICAgICAgICAgICAgICAgIG1vZF9jbnQrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGN1ZFtgbmV3JHtjbnR9YF0gPSB4O1xuICAgICAgICAgICAgICAgIGNudCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2hrX2RlbFt4LmlkIV0gPSB4O1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBkZWxfY250ID0gb3JpZy5yZWR1Y2UoKGNvdW50OiBudW1iZXIsIHg6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKCEoeC5pZCBpbiBjaGtfZGVsKSkge1xuICAgICAgICAgICAgICAgIGN1ZFt4LmlkXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvdW50ICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb3VudDtcbiAgICAgICAgfSwgMCk7XG5cbiAgICAgICAgbGV0IHN0ciA9ICcnO1xuICAgICAgICBpZiAoY250KSBzdHIgKz0gYEFkZCAke2NudH0gUmVjb3JkJHtjbnQgPiAxID8gJ3MnIDogJyd9XFxyXFxuYDtcbiAgICAgICAgaWYgKGRlbF9jbnQpIHN0ciArPSBgRGVsZXRlICR7ZGVsX2NudH0gUmVjb3JkJHtkZWxfY250ID4gMSA/ICdzJyA6ICcnfVxcclxcbmA7XG4gICAgICAgIGlmIChtb2RfY250KSBzdHIgKz0gYFVwZGF0ZSAke21vZF9jbnR9IFJlY29yZCR7bW9kX2NudCA+IDEgPyAncycgOiAnJ31cXHJcXG5gO1xuXG4gICAgICAgIGlmICghc3RyKSB7XG4gICAgICAgICAgICBhbGVydCgnTm8gQ2hhbmdlcyBkZXRlY3RlZCcpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbmZpcm0oc3RyKSkge1xuICAgICAgICAgICAgY29uc3QgZm9ybURhdGEgPSBuZXcgRm9ybURhdGEoKTtcbiAgICAgICAgICAgIGZvcm1EYXRhLmFwcGVuZCgnY3NyZm1pZGRsZXdhcmV0b2tlbicsIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdbbmFtZT1jc3JmbWlkZGxld2FyZXRva2VuXScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKTtcbiAgICAgICAgICAgIGZvcm1EYXRhLmFwcGVuZCgncmVjb3JkX2xpc3QnLCBKU09OLnN0cmluZ2lmeShjdWQpKTtcblxuICAgICAgICAgICAgcG9zdFdpdGhDc3JmKGAke3RoaXMuaHJlZn0nJy9gLCBmb3JtRGF0YSlcbiAgICAgICAgICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS50ZXh0KCkpXG4gICAgICAgICAgICAgICAgLnRoZW4oZGF0YSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGFsZXJ0KGRhdGEpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZGF0YSA9PT0gJ0NsZWFyZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjU2F2ZUFsbCcpIS5jbGFzc0xpc3QuYWRkKCdkLW5vbmUnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IGNvbnNvbGUuZXJyb3IoJ0Vycm9yOicsIGVycm9yKSk7XG4gICAgICAgIH1cbiAgICAgICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdTYXZlQWxsJykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQpLmRpc2FibGVkID0gdHJ1ZTtcbiAgICB9XG4gICAgc2V0UmVzZXRBbGwoZTogYW55KSB7XG4gICAgICAgIGlmIChlLnRhcmdldC5jaGVja2VkKSB7XG4gICAgICAgICAgICB0aGlzLnNlbF9yb3dzID0gWy4uLkFycmF5KHRoaXMuY29sbGVjdGlvbi5sZW5ndGggKyAxKS5rZXlzKCldLnNsaWNlKDEpO1xuICAgICAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI2luZGV4IHRib2R5IGlucHV0JykuZm9yRWFjaCgoeDogYW55KSA9PiB4LmNoZWNrZWQgPSB0cnVlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2VsX3Jvd3MgPSBbXTtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNpbmRleCB0Ym9keSBpbnB1dCcpLmZvckVhY2goKHg6IGFueSkgPT4geC5jaGVja2VkID0gZmFsc2UpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0U2VsQ291bnQoKTtcbiAgICB9XG4gICAgc2V0U2VsQ291bnQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbF9yb3dzLmxlbmd0aCkge1xuICAgICAgICAgICAgLy9kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVsLXJlY29yZCcpLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2VsLXJvd3MnKSEudGV4dENvbnRlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjaW5kZXggdGJvZHkgaW5wdXQ6Y2hlY2tlZCcpLmxlbmd0aCArICcgU2VsZWN0ZWQnO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy9kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnZGVsLXJlY29yZCcpLmRpc2FibGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZWwtcm93cycpIS50ZXh0Q29udGVudCA9ICcnO1xuICAgICAgICB9XG4gICAgfVxuICAgIHNldE1haW4oZTogYW55KSB7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ21haW4nKSEuY2xhc3NMaXN0LnRvZ2dsZSgnY29udGFpbmVyJyk7XG4gICAgICAgIHRoaXMuc2V0SWNvbigpO1xuICAgICAgICBlLnRhcmdldC5jbG9zZXN0KCdidXR0b24nKS5ibHVyKCk7XG4gICAgfVxuICAgIHNldEljb24oKSB7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNjb20tZXhwIGknKSEuY2xhc3NOYW1lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignbWFpbicpIS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbnRhaW5lcicpID9cbiAgICAgICAgICAgICdiaSBiaS1hcnJvd3MtYW5nbGUtZXhwYW5kJyA6ICdiaSBiaS1hcnJvd3MtYW5nbGUtY29udHJhY3QnO1xuICAgIH1cbiAgICBlbmJfc2F2ZSgpIHtcbiAgICAgICAgaWYgKCFkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnU2F2ZUFsbCcpKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ1NhdmVBbGwnKSBhcyBIVE1MQnV0dG9uRWxlbWVudCkuZGlzYWJsZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5tb2RpZmlmZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLnRib2R5UmVuZGVyKCk7XG4gICAgfVxuICAgIEZvcm1FZGl0X2tleXVwKGU6IGFueSkge1xuICAgICAgICBpZiAoZS5rZXkgIT0gJ0VudGVyJylcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIFNhdmVNb2RlbCgpIHtcbiAgICAgICAgY29uc3QgY2Zvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3J1X2Zvcm0nKSBhcyBIVE1MRm9ybUVsZW1lbnQ7XG4gICAgICAgIGxldCBuZHggPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjaW5kZXggdGJvZHkgdHIudGFibGUtYWN0aXZlJykgYXMgSFRNTFRhYmxlUm93RWxlbWVudDtcbiAgICAgICAgbGV0IG5keF92YWwgPSBuZHggPyBuZHgucm93SW5kZXggLSAxIDogLTE7XG4gICAgICAgIGxldCBuciA9IGZhbHNlO1xuICAgICAgICBpZiAobmR4X3ZhbCA8IDApIHtcbiAgICAgICAgICAgIG5keF92YWwgPSB0aGlzLmNvbGxlY3Rpb24ubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0aW9uW25keF92YWxdID0ge30gYXMgYW55O1xuICAgICAgICAgICAgbnIgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZkdCA9IG5ldyBGb3JtRGF0YShjZm9ybSk7XG4gICAgICAgIGZkdC5mb3JFYWNoKCh2YWwsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCdjc3JmJykpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKGtleS5zdGFydHNXaXRoKCdGSycpLyogJiYga2V5LmVuZHNXaXRoKCdfaWQnKSovKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChrZXkpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcbiAgICAgICAgICAgICAgICBjb25zdCBjaGlsZHMgPSBlbCA/IChBcnJheS5mcm9tKGVsLmNoaWxkcmVuKSBhcyBhbnlbXSkgOiBbXTtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWVsZE5hbWUgPSBrZXkuc2xpY2UoMik7XG4gICAgICAgICAgICAgICAgbGV0IHBrVmFsdWU6IGFueSA9ICcnO1xuICAgICAgICAgICAgICAgIGlmICh2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgbWF0Y2ggPSBjaGlsZHMuZmluZCh5ID0+IHkudmFsdWUgPT0gdmFsIHx8IHkuZGF0YXNldD8ucGsgPT0gdmFsIHx8IHkudGV4dENvbnRlbnQ/LnRyaW0oKSA9PSB2YWwpO1xuICAgICAgICAgICAgICAgICAgICBwa1ZhbHVlID0gbWF0Y2g/LmRhdGFzZXQ/LnBrID8/IChtYXRjaCA/IG1hdGNoLnZhbHVlIDogdmFsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgKHRoaXMuY29sbGVjdGlvbltuZHhfdmFsXSBhcyBhbnkpW2ZpZWxkTmFtZV0gPSBwa1ZhbHVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IHJvdyA9IHRoaXMuY29sbGVjdGlvbltuZHhfdmFsXSBhcyBhbnk7XG4gICAgICAgICAgICAgICAgaWYgKHJvdyAmJiAhKGZpZWxkTmFtZSBpbiByb3cpICYmICgoZmllbGROYW1lICsgJ19pZCcpIGluIHJvdykpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93W2ZpZWxkTmFtZSArICdfaWQnXSA9IHBrVmFsdWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh2YWwgaW5zdGFuY2VvZiBGaWxlKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgaW1nRWxlbWVudCA9IGNmb3JtLnF1ZXJ5U2VsZWN0b3IoYGltZ1tkYXRhLWltZ2lkPSR7a2V5fV1gKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuICAgICAgICAgICAgICAgICh0aGlzLmNvbGxlY3Rpb25bbmR4X3ZhbF0gYXMgYW55KVtrZXldID0gaW1nRWxlbWVudCA/IGltZ0VsZW1lbnQuc3JjIDogJyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICh0aGlzLmNvbGxlY3Rpb25bbmR4X3ZhbF0gYXMgYW55KVtrZXldID0ga2V5ID09ICdpZCcgJiYgbnIgPyBgbmV3JHtuZHhfdmFsICsgMX1gIDogdmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5lbmJfc2F2ZSgpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0SW5kZXgnKSEuY2xpY2soKTtcbiAgICB9XG5cbiAgICBpbWdTYXZlKGU6IGFueSkge1xuICAgICAgICBpZiAoIWUudGFyZ2V0LmZpbGVzLmxlbmd0aCkgcmV0dXJuO1xuXG4gICAgICAgIGNvbnN0IGZpbGUgPSBlLnRhcmdldC5maWxlc1swXTtcbiAgICAgICAgaWYgKCFmaWxlLnR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJykpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbmRleCB0ZC50YWJsZS1hY3RpdmUnKT8uY2xhc3NMaXN0LnJlbW92ZSgndGFibGUtYWN0aXZlJyk7XG4gICAgICAgICAgICBhbGVydCgnSW52YWxpZCBJbWFnZSBmaWxlJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuICAgICAgICBjb25zdCBpbWdfaWQgPSBlLnRhcmdldC5pZDtcbiAgICAgICAgcmVhZGVyLm9ubG9hZCA9IChldmVudDogYW55KSA9PiB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBldmVudC50YXJnZXQucmVzdWx0O1xuICAgICAgICAgICAgY29uc3QgdGQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjaW5kZXggdGQudGFibGUtYWN0aXZlJykgYXMgSFRNTEVsZW1lbnQ7XG5cbiAgICAgICAgICAgIGlmICghdGQpIHtcbiAgICAgICAgICAgICAgICAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgI2NydV9mb3JtIGltZ1tkYXRhLWltZ2lkPVwiJHtpbWdfaWR9XCJdYCkgYXMgSFRNTEltYWdlRWxlbWVudCkuc3JjID0gcmVzdWx0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBuZHggPSAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2luZGV4IHRyLnRhYmxlLWFjdGl2ZScpIGFzIEhUTUxUYWJsZVJvd0VsZW1lbnQpLnJvd0luZGV4IC0gMTtcbiAgICAgICAgICAgICAgICAodGhpcy5jb2xsZWN0aW9uW25keF0gYXMgYW55KVt0ZC5kYXRhc2V0Lm5hbWUhXSA9IHJlc3VsdDtcbiAgICAgICAgICAgICAgICB0ZC5xdWVyeVNlbGVjdG9yKCdpbWcnKSEuc3JjID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgIHRkLmNsYXNzTGlzdC5yZW1vdmUoJ3RhYmxlLWFjdGl2ZScpO1xuICAgICAgICAgICAgICAgIHRoaXMuZW5iX3NhdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgcmVhZGVyLnJlYWRBc0RhdGFVUkwoZmlsZSk7XG4gICAgfVxuXG4gICAgQXBwbHlGaWx0ZXIoZTogYW55KSB7XG4gICAgICAgIHRoaXMuZmlsdGVyID0ge307XG4gICAgICAgIHRoaXMuZXhjbHVkZSA9IHt9O1xuICAgICAgICBsZXQgZGF0ID0gbmV3IEZvcm1EYXRhKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdjcnVfZm9ybScpIGFzIEhUTUxGb3JtRWxlbWVudCk7XG4gICAgICAgIGRhdC5mb3JFYWNoKCh2YWx1ZTogYW55LCBrZXkpID0+IHtcbiAgICAgICAgICAgIGxldCBpc0ZvcmVpZ25LZXkgPSBrZXkuc3RhcnRzV2l0aCgnRksnKS8qICYmIGtleS5lbmRzV2l0aCgnX2lkJykqLztcbiAgICAgICAgICAgIGxldCBlbGVtZW50SWQgPSBpc0ZvcmVpZ25LZXkgPyBrZXkuc2xpY2UoMikgOiBrZXk7XG4gICAgICAgICAgICBsZXQgZWxlID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoZWxlbWVudElkKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICAgICAgaWYgKCFlbGUgfHwgZWxlLmlkID09PSAnaWQnIHx8IGVsZS50eXBlID09PSAnZmlsZScpIHJldHVybjtcbiAgICAgICAgICAgIGxldCBjb25kID0gZWxlLnByZXZpb3VzRWxlbWVudFNpYmxpbmcgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgIGlmIChlbGUudHlwZSA9PT0gJ2NoZWNrYm94Jykge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZSc7XG4gICAgICAgICAgICAgICAgaWYgKCFjb25kIHx8IGNvbmQudGFnTmFtZSAhPT0gJ1NFTEVDVCcpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uZCA9IGVsZS5wYXJlbnRFbGVtZW50Py5wcmV2aW91c0VsZW1lbnRTaWJsaW5nIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFjb25kKSByZXR1cm47XG4gICAgICAgICAgICBsZXQgY29uZF92YWwgPSBjb25kLnZhbHVlO1xuICAgICAgICAgICAgaWYgKCFjb25kX3ZhbCkgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKGlzRm9yZWlnbktleSkge1xuICAgICAgICAgICAgICAgIGxldCBma3YgPSBBcnJheS5mcm9tKChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChrZXkpIGFzIEhUTUxFbGVtZW50KS5jaGlsZHJlbikuZmluZCgoeTogYW55KSA9PiB5LnZhbHVlID09PSB2YWx1ZSkgYXMgYW55O1xuICAgICAgICAgICAgICAgIGtleSA9IGtleS5zbGljZSgyKTtcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IGZrdiA/IGZrdi5kYXRhc2V0LnBrIDogdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoY29uZF92YWwgPT09ICdfX2lzbnVsbCcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlcltrZXkgKyBjb25kX3ZhbF0gPSAhdmFsdWUgfHwgU3RyaW5nKHZhbHVlKS50b0xvd2VyQ2FzZSgpID09PSAndHJ1ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbmRfdmFsID09PSAnPScpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlcltrZXldID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNvbmRfdmFsID09PSAnZXhjbHVkZScpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4Y2x1ZGVba2V5XSA9IHZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbHRlcltrZXkgKyBjb25kX3ZhbF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuRmlsdGVyT1IgPSAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ0ZpbHRlck9SJykgYXMgSFRNTElucHV0RWxlbWVudCkuY2hlY2tlZDtcbiAgICAgICAgdGhpcy5zZXRDb2xsKDEpO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0SW5kZXgnKSEuY2xpY2soKTtcbiAgICB9XG5cbiAgICBhZGRFbGVtZW50KHM6IGFueSwgb3B0OiBzdHJpbmcpIHtcbiAgICAgICAgY29uc3QgaW5zID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQob3B0KSEuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIGlucy5yZW1vdmVBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgICAgIHMuYmVmb3JlKGlucyk7XG5cbiAgICAgICAgbGV0IHMyOiBhbnkgPSBudWxsO1xuICAgICAgICBpZiAob3B0ID09PSAnb3B0X251bScpIHtcbiAgICAgICAgICAgIHMyID0gcy5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICAgICAgICBzMi5yZW1vdmVBdHRyaWJ1dGUoJ25hbWUnKTtcbiAgICAgICAgICAgIHMyLnJlbW92ZUF0dHJpYnV0ZSgnaWQnKTtcbiAgICAgICAgICAgIHMyLnNldEF0dHJpYnV0ZSgndGl0bGUnLCAnSWdub3JlZCBleGNlcHQgZm9yIFwiQmV0d2VlblwiIE9wdGlvbiBMb3dlciBMaW1pdCcpO1xuICAgICAgICAgICAgaW5zLmJlZm9yZShzMik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCB3ID0gcy5nZXRBdHRyaWJ1dGUoJ2lkJyk7XG4gICAgICAgIGNvbnN0IGZpbHRlckVudHJ5ID0gdGhpcy5maWx0ZXJbd107XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGVFbnRyeSA9IHRoaXMuZXhjbHVkZVt3XTtcblxuICAgICAgICBpZiAoZmlsdGVyRW50cnkpIHtcbiAgICAgICAgICAgIGlucy52YWx1ZSA9ICc9JztcbiAgICAgICAgICAgIHMudmFsdWUgPSBzLmxpc3QgPyB0aGlzLmxrdXBbcy5pZF1bZmlsdGVyRW50cnldIDogZmlsdGVyRW50cnk7XG4gICAgICAgIH0gZWxzZSBpZiAoZXhjbHVkZUVudHJ5KSB7XG4gICAgICAgICAgICBpbnMudmFsdWUgPSAnZXhjbHVkZSc7XG4gICAgICAgICAgICBzLnZhbHVlID0gZXhjbHVkZUVudHJ5O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgbmR4ID0gT2JqZWN0LmtleXModGhpcy5maWx0ZXIpLmZpbmQoeCA9PiB4LnN0YXJ0c1dpdGgodykpO1xuICAgICAgICAgICAgaWYgKCFuZHgpIHtcbiAgICAgICAgICAgICAgICBzLnZhbHVlID0gJyc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHRoaXMuZmlsdGVyW25keF0pICYmIHMyKSB7XG4gICAgICAgICAgICAgICAgICAgIHMudmFsdWUgPSB0aGlzLmZpbHRlcltuZHhdWzFdO1xuICAgICAgICAgICAgICAgICAgICBzMi52YWx1ZSA9IHRoaXMuZmlsdGVyW25keF1bMF07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuZHguaW5jbHVkZXMoJ251bGwnKSkge1xuICAgICAgICAgICAgICAgICAgICBzLnZhbHVlID0gdGhpcy5maWx0ZXJbbmR4XSB8fCAnJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzLnZhbHVlID0gdGhpcy5maWx0ZXJbbmR4XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaW5zLnZhbHVlID0gbmR4LnNsaWNlKG5keC5pbmRleE9mKCdfXycpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNob3dDcnVGaWx0ZXIoZT86IGFueSkge1xuICAgICAgICBpZiAoIXRoaXMuZm9ybSkge1xuICAgICAgICAgICAgYWxlcnQoJ05vIERhdGEnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZXQgY3J1ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NydV9mb3JtJykhO1xuICAgICAgICBjcnUuaW5uZXJIVE1MID0gdGhpcy5mb3JtO1xuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjY3J1X2Zvcm0gaW5wdXRbbGlzdF0nKS5mb3JFYWNoKHMgPT4ge1xuICAgICAgICAgICAgdGhpcy5hZGRFbGVtZW50KHMsICdvcHRfZmtleScpO1xuICAgICAgICB9KTtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI2NydV9mb3JtIGlucHV0W3R5cGU9bnVtYmVyXSxpbnB1dFt0eXBlPWRhdGVdLGlucHV0W3R5cGU9ZGF0YXRpbWUtbG9jYWxdJylcbiAgICAgICAgICAgIC5mb3JFYWNoKHMgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkRWxlbWVudChzLCAnb3B0X251bScpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNjcnVfZm9ybSBpbnB1dFt0eXBlPXRleHRdLCB0ZXh0YXJlYScpLmZvckVhY2gocyA9PiB7XG4gICAgICAgICAgICB0aGlzLmFkZEVsZW1lbnQocywgJ29wdF90eHQnKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGZpbHRyID0gT2JqZWN0LmtleXModGhpcy5maWx0ZXIpLmxlbmd0aDtcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI2NydV9mb3JtIC5mb3JtLWNoZWNrLWlucHV0JykuZm9yRWFjaCgoczogYW55KSA9PiB7XG4gICAgICAgICAgICBsZXQgaW5zID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ29wdF9jaGsnKSEuY2xvbmVOb2RlKHRydWUpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgICAgICBpbnMucmVtb3ZlQXR0cmlidXRlKCdpZCcpO1xuICAgICAgICAgICAgcy5iZWZvcmUoaW5zKTtcbiAgICAgICAgICAgIGxldCB2YWwgPSBzLnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0JylbMV07XG4gICAgICAgICAgICBpZiAodmFsICYmIGZpbHRyICYmIHZhbC5pZCBpbiB0aGlzLmZpbHRlcikge1xuICAgICAgICAgICAgICAgIGlucy52YWx1ZSA9ICc9JztcbiAgICAgICAgICAgICAgICB2YWwuY2hlY2tlZCA9IHRoaXMuZmlsdGVyW3ZhbC5pZF07XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNldEZvcm1IdCgpO1xuICAgIH1cblxuICAgIHNldEZvcm1EYXRhKG5keDogbnVtYmVyKSB7XG4gICAgICAgIE9iamVjdC5lbnRyaWVzKHRoaXMuY29sbGVjdGlvbltuZHhdIGFzIGFueSkuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG4gICAgICAgICAgICBsZXQgZWxlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgI2NydV9mb3JtICMke2tleX1gKSBhcyBhbnk7XG4gICAgICAgICAgICBpZiAoIWVsZSAmJiBrZXkuZW5kc1dpdGgoJ19pZCcpKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmFzZUtleSA9IGtleS5zbGljZSgwLCAtMyk7XG4gICAgICAgICAgICAgICAgZWxlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgI2NydV9mb3JtICNGSyR7YmFzZUtleX1gKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKGAjY3J1X2Zvcm0gIyR7YmFzZUtleX1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghZWxlKSByZXR1cm47XG4gICAgICAgICAgICBzd2l0Y2ggKGVsZS50eXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnZmlsZSc6XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGltZyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYGltZ1tkYXRhLWltZ2lkPSR7ZWxlLmlkfV1gKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICBpbWcuc3JjID0gdmFsdWUgYXMgc3RyaW5nO1xuICAgICAgICAgICAgICAgICAgICBpbWcucGFyZW50RWxlbWVudCEubmV4dEVsZW1lbnRTaWJsaW5nIVxuICAgICAgICAgICAgICAgICAgICAgICAgLnF1ZXJ5U2VsZWN0b3IoJ2xhYmVsJykhLnRleHRDb250ZW50ID0gYFJlcGxhY2UgSW1hZ2U6JHsodmFsdWUgYXMgc3RyaW5nKS5zbGljZSgxICsgKHZhbHVlIGFzIHN0cmluZykuaW5kZXhPZignLScpKX1gO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdjaGVja2JveCc6XG4gICAgICAgICAgICAgICAgICAgIGVsZS5jaGVja2VkID0gdmFsdWUgPT09IHRydWUgfHwgdmFsdWUgPT09ICd0cnVlJyB8fCB2YWx1ZSA9PT0gJ1RydWUnO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdkYXRldGltZS1sb2NhbCc6XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZSAhPT0gJ251bGwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGUudmFsdWUgPSBTdHJpbmcodmFsdWUpLnRyaW0oKS5yZXBsYWNlKCcgJywgJ1QnKS5zbGljZSgwLCAxOSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGUudmFsdWUgPSAnJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBjYXNlICdkYXRlJzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlICE9PSAnbnVsbCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZS52YWx1ZSA9IFN0cmluZyh2YWx1ZSkudHJpbSgpLnNsaWNlKDAsIDEwKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZS52YWx1ZSA9ICcnO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIGlmIChlbGUubGlzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbG9va3VwS2V5ID0gZWxlLmlkLnN0YXJ0c1dpdGgoJ0ZLJykgPyBlbGUuaWQuc2xpY2UoMikgOiBlbGUuaWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByYXdMayA9IGxvb2t1cEtleS5lbmRzV2l0aCgnX2lkJykgPyBsb29rdXBLZXkuc2xpY2UoMCwgLTMpIDogbG9va3VwS2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9ybUxrdXAgPSAodGhpcy5sa3VwICYmICh0aGlzLmxrdXBbbG9va3VwS2V5XSB8fCB0aGlzLmxrdXBbcmF3TGtdIHx8IHRoaXMubGt1cFtgJHtyYXdMa31faWRgXSkpIHx8IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGUudmFsdWUgPSB2YWx1ZSAmJiB2YWx1ZSAhPT0gJ251bGwnID8gKGZvcm1Ma3VwPy5bdmFsdWUgYXMgc3RyaW5nXSB8fCB2YWx1ZSkgOiAnJztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGUudmFsdWUgPSB2YWx1ZSAmJiAodmFsdWUgYXMgYW55KSAhPT0gJ251bGwnID8gSlNPTi5zdHJpbmdpZnkodmFsdWUpIDogJyc7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbGUudmFsdWUgPSB2YWx1ZSAmJiB2YWx1ZSAhPT0gJ251bGwnID8gdmFsdWUgOiAnJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBzZXRFZGl0KGU6IGFueSkge1xuICAgICAgICBpZiAoIXRoaXMuZm9ybSkge1xuICAgICAgICAgICAgYWxlcnQoJ05vIERhdGEnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNydUZvcm0gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3J1X2Zvcm0nKSE7XG4gICAgICAgIGNydUZvcm0uaW5uZXJIVE1MID0gdGhpcy5mb3JtO1xuXG4gICAgICAgIGNvbnN0IGVkaXRCdXR0b24gPSBlLnRhcmdldC5jbG9zZXN0KCdidXR0b24nKS5pZCA9PT0gJ2VkaXQnO1xuICAgICAgICBjb25zdCBpbmRleFJvdyA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNpbmRleCB0Ym9keSB0ci50YWJsZS1hY3RpdmUnKSBhcyBIVE1MVGFibGVSb3dFbGVtZW50O1xuXG4gICAgICAgIGlmIChlZGl0QnV0dG9uKSB7XG4gICAgICAgICAgICBjb25zdCBuZHggPSBpbmRleFJvdy5yb3dJbmRleCAtIDE7XG4gICAgICAgICAgICB0aGlzLnNldEZvcm1EYXRhKG5keCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCcjaW5kZXggdGJvZHkgaW5wdXQ6Y2hlY2tlZCcpLmZvckVhY2goKGlucHV0OiBhbnkpID0+IGlucHV0LmNoZWNrZWQgPSBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoaW5kZXhSb3cpXG4gICAgICAgICAgICAgICAgaW5kZXhSb3cuY2xhc3NMaXN0LnJlbW92ZSgndGFibGUtYWN0aXZlJyk7XG4gICAgICAgICAgICAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2NydV9mb3JtICNpZCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gYG5ldyR7dGhpcy5jb2xsZWN0aW9uLmxlbmd0aH1gO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2V0Rm9ybUh0KCdTYXZlJyk7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ2lucHV0W3R5cGU9XCJmaWxlXCJdJykuZm9yRWFjaCgoaW5wdXQ6IGFueSkgPT4gaW5wdXQub25jaGFuZ2UgPSAoZTogYW55KSA9PiB0aGlzLmltZ1NhdmUoZSkpO1xuICAgIH1cblxuICAgIHNldEZvcm1IdCh3aGljaD86IHN0cmluZykge1xuICAgICAgICB0aGlzLlNob3dUYWIoJ2Zvcm0tZWRpdCcpO1xuICAgICAgICBjb25zdCBzYXZlQnV0dG9uID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ1NhdmUnKSE7XG4gICAgICAgIGNvbnN0IGFwcGx5RmlsdGVyRGl2ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ0FwcGx5RmlsdGVyJykhO1xuXG4gICAgICAgIGlmICh3aGljaCA9PT0gJ1NhdmUnKSB7XG4gICAgICAgICAgICBzYXZlQnV0dG9uLnBhcmVudEVsZW1lbnQhLmNsYXNzTGlzdC5yZW1vdmUoJ2Qtbm9uZScpO1xuICAgICAgICAgICAgYXBwbHlGaWx0ZXJEaXYuY2xhc3NMaXN0LmFkZCgnZC1ub25lJyk7XG4gICAgICAgICAgICBzYXZlQnV0dG9uLm9uY2xpY2sgPSAoKSA9PiB0aGlzLlNhdmVNb2RlbCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdGaWx0ZXJPUicpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLmNoZWNrZWQgPSB0aGlzLkZpbHRlck9SO1xuICAgICAgICAgICAgc2F2ZUJ1dHRvbi5wYXJlbnRFbGVtZW50IS5jbGFzc0xpc3QuYWRkKCdkLW5vbmUnKTtcbiAgICAgICAgICAgIGFwcGx5RmlsdGVyRGl2LmNsYXNzTGlzdC5yZW1vdmUoJ2Qtbm9uZScpO1xuICAgICAgICAgICAgYXBwbHlGaWx0ZXJEaXYucXVlcnlTZWxlY3RvcignYnV0dG9uJykhLm9uY2xpY2sgPSAoZSkgPT4gdGhpcy5BcHBseUZpbHRlcihlKTtcbiAgICAgICAgfVxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnQ2xvc2UnKSEub25jbGljayA9ICgpID0+IHRoaXMuU2hvd1RhYignaW5kZXgnKTtcbiAgICAgICAgY29uc3QgZmRpdiA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJyNjcnVfZm9ybSBkaXY6Zmlyc3Qtb2YtdHlwZScpIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICBjb25zdCBtYXhIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgLSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdmb290ZXInKSEub2Zmc2V0SGVpZ2h0IC1cbiAgICAgICAgICAgIGZkaXYub2Zmc2V0VG9wIC0gMzI7XG4gICAgICAgIGZkaXYuc3R5bGUubWF4SGVpZ2h0ID0gYCR7bWF4SGVpZ2h0fXB4YDtcbiAgICB9XG5cbiAgICBjaGFuZ2VEaXIoZTogYW55KSB7XG4gICAgICAgIGxldCB0Z3QgPSBlLnRhcmdldC5jbG9zZXN0KCdidXR0b24nKTtcbiAgICAgICAgaWYgKHRndC5kYXRhc2V0LmRpcikge1xuICAgICAgICAgICAgdGd0LmRhdGFzZXQuZGlyID0gJyc7XG4gICAgICAgICAgICB0Z3QuaW5uZXJIVE1MID0gJzxpIGNsYXNzPVwiYmkgYmktc29ydC1hbHBoYS1kb3duXCI+PC9pPic7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0Z3QuZGF0YXNldC5kaXIgPSAnLSc7XG4gICAgICAgICAgICB0Z3QuaW5uZXJIVE1MID0gJzxpIGNsYXNzPVwiYmkgYmktc29ydC1hbHBoYS11cC1hbHRcIj48L2k+JztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmxvYWRQYWdlTnVtKCk7XG4gICAgfVxuICAgIGxvYWRQYWdlTnVtKGU/OiBhbnkpIHtcbiAgICAgICAgbGV0IGlucCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdQYWdlTnVtJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgbGV0IHZhbCA9IHBhcnNlSW50KGlucC52YWx1ZSk7XG4gICAgICAgIGxldCBtYXggPSBwYXJzZUludChpbnAubWF4KTtcbiAgICAgICAgaWYgKHZhbCA+IG1heCkge1xuICAgICAgICAgICAgdmFsID0gbWF4O1xuICAgICAgICAgICAgaW5wLnZhbHVlID0gU3RyaW5nKG1heCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXRDb2xsKHZhbCk7XG4gICAgfVxuICAgIGNoYW5nZVJvd3NQUChlOiBhbnkpIHtcbiAgICAgICAgbGV0IGVsZSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdyb3dzX3BwJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgbGV0IG1heCA9IHBhcnNlSW50KGVsZS5tYXgpO1xuICAgICAgICBsZXQgbWluID0gcGFyc2VJbnQoZWxlLm1pbik7XG4gICAgICAgIGxldCBycHAgPSBwYXJzZUludChlbGUudmFsdWUpO1xuICAgICAgICBpZiAocnBwID4gbWF4KVxuICAgICAgICAgICAgZWxlLnZhbHVlID0gU3RyaW5nKG1heCk7XG4gICAgICAgIGVsc2UgaWYgKHJwcCA8IG1pbilcbiAgICAgICAgICAgIGVsZS52YWx1ZSA9IFN0cmluZyhtaW4pO1xuICAgICAgICB0aGlzLnNldENvbGwoMSk7XG4gICAgfVxuICAgIHNldENvbGwocGFnZV9udW06IG51bWJlcikge1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc2V0SW5kZXgnKSEuY2xpY2soKTtcbiAgICAgICAgdGhpcy54cG9zID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2luZGV4IHRhYmxlJykhLnBhcmVudEVsZW1lbnQhLnNjcm9sbExlZnQ7XG4gICAgICAgIGxldCBkYXQ6IGFueSA9IHt9O1xuICAgICAgICBpZiAoKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvcmRlcl9ieScpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlKVxuICAgICAgICAgICAgZGF0Lm9yZGVyX2J5ID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdvcmRlcl9kaXInKSBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5kaXIgKyAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ29yZGVyX2J5JykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG4gICAgICAgIGRhdC5maWx0ZXIgPSB0aGlzLmZpbHRlcjtcbiAgICAgICAgZGF0LmV4Y2x1ZGUgPSB0aGlzLmV4Y2x1ZGU7XG4gICAgICAgIGRhdC5wYWdlX251bSA9IHBhZ2VfbnVtO1xuICAgICAgICBkYXQucm93c19wcCA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncm93c19wcCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlO1xuICAgICAgICBkYXQuc2hvdyA9IEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLm9mZmNhbnZhcy1ib2R5IGlucHV0Om5vdCg6Y2hlY2tlZCknKSkubWFwKCh4OiBhbnkpID0+IHBhcnNlSW50KHgudmFsdWUpKTtcbiAgICAgICAgY29uc3QgcmVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3JlbGF0ZWQnKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuICAgICAgICBpZiAocmVsKVxuICAgICAgICAgICAgZGF0LnJlbGF0ZWQgPSBKU09OLnBhcnNlKHJlbC52YWx1ZS5yZXBsYWNlKC8nL2csICdcIicpKTtcbiAgICAgICAgY29uc3QgcmVzID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3Jlc3RyaWN0JykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgaWYgKHJlcylcbiAgICAgICAgICAgIGRhdC5yZXN0cmljdCA9IEpTT04ucGFyc2UocmVzLnZhbHVlLnJlcGxhY2UoLycvZywgJ1wiJykpO1xuICAgICAgICBpZiAodGhpcy5GaWx0ZXJPUilcbiAgICAgICAgICAgIGRhdC5GaWx0ZXJPUiA9IHRydWU7XG4gICAgICAgIGNvbnN0IGhyID0gdGhpcy5ocmVmICsgSlNPTi5zdHJpbmdpZnkoZGF0KSArICcvJztcbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2luZGV4IHRib2R5JykhLmlubmVySFRNTCA9ICcnO1xuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnc3Bpbm5lcicpIS5pbm5lckhUTUwgPSB0aGlzLnNwaW5uZXI7XG4gICAgICAgIGZldGNoKGhyKVxuICAgICAgICAgICAgLnRoZW4oYXN5bmMgcmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXJyVGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBIVFRQICR7cmVzcG9uc2Uuc3RhdHVzfTogJHtlcnJUZXh0LnNsaWNlKDAsIDIwMCl9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZS5qc29uKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oZGF0ID0+IHRoaXMuc2V0VGFibGVzKGRhdCkpICAvLyBEaXJlY3RseSB1c2UgdGhlIGNhbGxiYWNrIGhlcmVcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NwaW5uZXInKSEuaW5uZXJIVE1MID0gJyc7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZmV0Y2hpbmcgZGF0YTonLCBlcnJvcik7XG4gICAgICAgICAgICB9KTtcbiAgICB9XG4gICAgZG93bmxvYWQoZTogYW55KSB7XG4gICAgICAgIGxldCBjc3Y6IGFueVtdID0gW107XG4gICAgICAgIGNvbnN0IGluZGV4VGhlYWQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjaW5kZXggdGhlYWQnKSB8fCBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjaW5kZXgtdGFibGUgdGhlYWQnKTtcbiAgICAgICAgaWYgKGluZGV4VGhlYWQpIHtcbiAgICAgICAgICAgIGNzdi5wdXNoKEFycmF5LmZyb20oaW5kZXhUaGVhZC5xdWVyeVNlbGVjdG9yQWxsKCd0ciB0aDpub3QoLmQtbm9uZSknKSkuc2xpY2UoMSkubWFwKHggPT4gJ1wiJyArICh4LnRleHRDb250ZW50IHx8ICcnKS50cmltKCkucmVwbGFjZSgvXCIvZywgJ1wiXCInKS50b1VwcGVyQ2FzZSgpICsgJ1wiJykuam9pbignLCcpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNzdi5wdXNoKEFycmF5LmZyb20oZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgndGhlYWQgdHIgdGg6bm90KC5kLW5vbmUpJykpLnNsaWNlKDEpLm1hcCh4ID0+ICdcIicgKyAoeC50ZXh0Q29udGVudCB8fCAnJykudHJpbSgpLnJlcGxhY2UoL1wiL2csICdcIlwiJykudG9VcHBlckNhc2UoKSArICdcIicpLmpvaW4oJywnKSk7XG4gICAgICAgIH1cbiAgICAgICAgZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnI2luZGV4IHRib2R5IHRyJykuZm9yRWFjaCh4ID0+IHtcbiAgICAgICAgICAgIGNzdi5wdXNoKEFycmF5LmZyb20oeC5xdWVyeVNlbGVjdG9yQWxsKCd0ZDpub3QoLmQtbm9uZSknKSkuc2xpY2UoMSkubWFwKHggPT4ge1xuICAgICAgICAgICAgICAgIGxldCB0ZXh0ID0gKHgudGV4dENvbnRlbnQgfHwgJycpLnRyaW0oKTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dC5zdGFydHNXaXRoKCcrJykpIHRleHQgPSB0ZXh0LnNsaWNlKDEpO1xuICAgICAgICAgICAgICAgIHJldHVybiAnXCInICsgdGV4dC5yZXBsYWNlKC9cIi9nLCAnXCJcIicpICsgJ1wiJztcbiAgICAgICAgICAgIH0pLmpvaW4oJywnKSk7XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBjc3ZTdHIgPSBjc3Yuam9pbignXFxyXFxuJyk7XG4gICAgICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbY3N2U3RyXSwgeyB0eXBlOiAndGV4dC9jc3Y7Y2hhcnNldD11dGYtODsnIH0pO1xuICAgICAgICBjb25zdCB1cmwgPSBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpO1xuICAgICAgICBsZXQgaGlkZGVuRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcbiAgICAgICAgaGlkZGVuRWxlbWVudC5ocmVmID0gdXJsO1xuICAgICAgICBoaWRkZW5FbGVtZW50LnRhcmdldCA9ICdfYmxhbmsnO1xuICAgICAgICBsZXQgZm4gPSAnZXhwb3J0JztcbiAgICAgICAgaWYgKHRoaXMuaHJlZikge1xuICAgICAgICAgICAgbGV0IGNsZWFuSHJlZiA9IHRoaXMuaHJlZi5yZXBsYWNlKC9cXC8rJC8sICcnKTtcbiAgICAgICAgICAgIGZuID0gY2xlYW5IcmVmLnNsaWNlKDEgKyBjbGVhbkhyZWYubGFzdEluZGV4T2YoJy8nKSkgfHwgJ2V4cG9ydCc7XG4gICAgICAgIH1cbiAgICAgICAgaGlkZGVuRWxlbWVudC5kb3dubG9hZCA9IGZuICsgJy5jc3YnO1xuICAgICAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGhpZGRlbkVsZW1lbnQpO1xuICAgICAgICBoaWRkZW5FbGVtZW50LmNsaWNrKCk7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlQ2hpbGQoaGlkZGVuRWxlbWVudCk7XG4gICAgICAgIFVSTC5yZXZva2VPYmplY3RVUkwodXJsKTtcbiAgICB9XG4gICAgc2V0VGFibGVzKGRhdGE6IGFueSkge1xuICAgICAgICBpZiAodHlwZW9mIChkYXRhKSA9PSB0eXBlb2YgKCcnKSlcbiAgICAgICAgICAgIGRhdGEgPSBKU09OLnBhcnNlKGRhdGEpO1xuICAgICAgICBsZXQgcG4gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnUGFnZU51bScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG4gICAgICAgIHBuLnZhbHVlID0gZGF0YS5wYWdlX251bTtcbiAgICAgICAgcG4ubWF4ID0gZGF0YS5uX3BhZ2VzO1xuICAgICAgICBwbi5kYXRhc2V0Lm5yb3dzID0gZGF0YS5uX3Jvd3M7XG4gICAgICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgncm93c19wcCcpIGFzIEhUTUxJbnB1dEVsZW1lbnQpLnZhbHVlID0gZGF0YS5yb3dzX3BwO1xuICAgICAgICB0aGlzLmNvbGxlY3Rpb24gPSBkYXRhLnJvd3M7XG4gICAgICAgIChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjaW5kZXggdGJvZHknKSBhcyBIVE1MRWxlbWVudCkuZGF0YXNldC5yb3dzID0gSlNPTi5zdHJpbmdpZnkodGhpcy5jb2xsZWN0aW9uKTtcbiAgICAgICAgdGhpcy5zZWxfcm93cyA9IFtdO1xuICAgICAgICB0aGlzLnJlbmRlcigpO1xuICAgIH1cbiAgICBjZWxsRWRpdChlOiBhbnkpIHtcbiAgICAgICAgY29uc3QgdGQgPSBlLnRhcmdldC5jbG9zZXN0KCd0ZCcpO1xuICAgICAgICBjb25zdCB0ciA9IHRkLmNsb3Nlc3QoJ3RyJyk7XG4gICAgICAgIGNvbnN0IG5keCA9IHRkLmNlbGxJbmRleDtcbiAgICAgICAgaWYgKCF0ci5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmxlLWFjdGl2ZScpKSB7XG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c1dhcm5pbmcgPSB0ci5wYXJlbnRFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3RyLnRhYmxlLWFjdGl2ZScpO1xuICAgICAgICAgICAgaWYgKHByZXZpb3VzV2FybmluZykgcHJldmlvdXNXYXJuaW5nLmNsYXNzTGlzdC5yZW1vdmUoJ3RhYmxlLWFjdGl2ZScpO1xuXG4gICAgICAgICAgICBjb25zdCBwcmV2aW91c0RhcmsgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjaW5kZXggdGQudGFibGUtYWN0aXZlJyk7XG4gICAgICAgICAgICBpZiAocHJldmlvdXNEYXJrKSBwcmV2aW91c0RhcmsuY2xhc3NMaXN0LnJlbW92ZSgndGFibGUtYWN0aXZlJyk7XG5cbiAgICAgICAgICAgIHRyLmNsYXNzTGlzdC5hZGQoJ3RhYmxlLWFjdGl2ZScpO1xuICAgICAgICAgICAgY29uc3QgZWRpdEJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdlZGl0JykgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG4gICAgICAgICAgICBpZiAoZWRpdEJ0bikgZWRpdEJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICB0aGlzLm5keCA9IHRyLnJvd0luZGV4O1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCF0aGlzLkZpZWxkRWRpdCkge1xuICAgICAgICAgICAgdGhpcy5TaG93VGFiKCdFeHRyYURldGFpbCcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChuZHggPj0gdGhpcy5maWVsZHMubGVuZ3RoKSByZXR1cm4gW3RyLnJvd0luZGV4LCB0ZC5jZWxsSW5kZXhdO1xuICAgICAgICBpZiAoIXRoaXMuZmllbGRzW25keF1bMl0pIHtcbiAgICAgICAgICAgIGFsZXJ0KCdOb3QgZWRpdGFibGUnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY3J1X2Zvcm0nKSEuaW5uZXJIVE1MID0gdGhpcy5mb3JtITtcbiAgICAgICAgY29uc3QgZWxlID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgI2NydV9mb3JtICMke3RoaXMuZmllbGRzW25keF1bMF19YCkgYXMgSFRNTEVsZW1lbnQ7XG4gICAgICAgIGlmICh0aGlzLmZpZWxkc1tuZHhdWzFdID09PSAnSW1hZ2VGaWVsZCcpIHtcbiAgICAgICAgICAgIHRkLmNsYXNzTGlzdC5hZGQoJ3RhYmxlLWFjdGl2ZScpO1xuICAgICAgICAgICAgZWxlLm9uY2hhbmdlID0gKGU6IGFueSkgPT4gdGhpcy5pbWdTYXZlKGUpO1xuICAgICAgICAgICAgZWxlLmNsaWNrKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY3B5ID0gZWxlLnBhcmVudEVsZW1lbnQhLmNsb25lTm9kZSh0cnVlKSBhcyBIVE1MRWxlbWVudDtcbiAgICAgICAgY3B5LmNoaWxkcmVuWzFdLnJlbW92ZUF0dHJpYnV0ZSgnaWQnKTtcbiAgICAgICAgY3B5LmNoaWxkcmVuWzFdLmNsYXNzTGlzdC5hZGQoJ2ZzLTUnKTtcbiAgICAgICAgY3B5LmNsYXNzTGlzdC5hZGQoJ2ZzLTUnKTtcbiAgICAgICAgY29uc3QgZiA9IHRoaXMuRmllbGRFZGl0Ll9lbGVtZW50O1xuICAgICAgICBmLnF1ZXJ5U2VsZWN0b3IoJ2Zvcm0nKS5pbm5lckhUTUwgPSBjcHkub3V0ZXJIVE1MO1xuICAgICAgICBmLnNldEF0dHJpYnV0ZSgnZGF0YS10cnRkJywgSlNPTi5zdHJpbmdpZnkoW3RyLnJvd0luZGV4LCBuZHhdKSk7XG4gICAgICAgIGNvbnN0IFtlaWQsIHR5cF0gPSB0aGlzLmZpZWxkc1tuZHhdO1xuICAgICAgICBzd2l0Y2ggKHR5cCkge1xuICAgICAgICAgICAgY2FzZSAnSlNPTkZpZWxkJzpcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0YXJlYSA9IGYucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKTtcbiAgICAgICAgICAgICAgICB0ZXh0YXJlYS5zcGVsbGNoZWNrID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgdGV4dGFyZWEucm93cyA9IDIwO1xuICAgICAgICAgICAgICAgIHRleHRhcmVhLnRleHRDb250ZW50ID0gdGQudGV4dENvbnRlbnQgPyBKU09OLnN0cmluZ2lmeShKU09OLnBhcnNlKHRkLnRleHRDb250ZW50KSwgbnVsbCwgNCkgOiAnJztcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ0ZvcmVpZ25LZXknOlxuICAgICAgICAgICAgICAgIGNvbnN0IHJhd0VpZCA9IGVpZC5lbmRzV2l0aCgnX2lkJykgPyBlaWQuc2xpY2UoMCwgLTMpIDogZWlkO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVkaXRMa3VwID0gKHRoaXMubGt1cCAmJiAodGhpcy5sa3VwW2VpZF0gfHwgdGhpcy5sa3VwW3Jhd0VpZF0gfHwgdGhpcy5sa3VwW2Ake3Jhd0VpZH1faWRgXSkpIHx8IG51bGw7XG4gICAgICAgICAgICAgICAgY29uc3QgaXNGYWxzeSA9ICF0ZC5kYXRhc2V0LnZhbCB8fCB0ZC5kYXRhc2V0LnZhbCA9PT0gJ251bGwnIHx8IHRkLmRhdGFzZXQudmFsID09PSAnTm9uZScgfHwgdGQuZGF0YXNldC52YWwgPT09ICd1bmRlZmluZWQnO1xuICAgICAgICAgICAgICAgIGYucXVlcnlTZWxlY3RvcignaW5wdXRbbGlzdF0nKS52YWx1ZSA9ICghaXNGYWxzeSAmJiBlZGl0TGt1cD8uW3RkLmRhdGFzZXQudmFsXSkgPyBlZGl0TGt1cFt0ZC5kYXRhc2V0LnZhbF0gOiAoaXNGYWxzeSA/ICcnIDogdGQuZGF0YXNldC52YWwpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGRsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYEZLJHtlaWR9YCkgfHwgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoYEZLJHtyYXdFaWR9YCk7XG4gICAgICAgICAgICAgICAgaWYgKGRsKSB7XG4gICAgICAgICAgICAgICAgICAgIGYucXVlcnlTZWxlY3RvcignZm9ybScpLmFwcGVuZENoaWxkKGRsLmNsb25lTm9kZSh0cnVlKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnQm9vbGVhbkZpZWxkJzpcbiAgICAgICAgICAgIGNhc2UgJ051bGxCb29sZWFuRmllbGQnOlxuICAgICAgICAgICAgICAgIGNvbnN0IGNoayA9IHRoaXMuY29sbGVjdGlvblt0aGlzLm5keCEgLSAxXVt0aGlzLmZpZWxkc1tuZHhdWzBdXTtcbiAgICAgICAgICAgICAgICBmLnF1ZXJ5U2VsZWN0b3IoJ2lucHV0LmZvcm0tY2hlY2staW5wdXQnKS5jaGVja2VkID0gY2hrID09IHRydWUgfHwgY2hrID09ICd0cnVlJyB8fCBjaGsgPT0gJ1RydWUnO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnVGV4dEZpZWxkJzpcbiAgICAgICAgICAgICAgICBmLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykudmFsdWUgPSB0ZC50ZXh0Q29udGVudDtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgZi5xdWVyeVNlbGVjdG9yKCdpbnB1dCcpLnZhbHVlID0gdGQudGV4dENvbnRlbnQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5GaWVsZEVkaXQuc2hvdygpO1xuICAgIH1cblxuICAgIGNlbGxTYXZlKGU6IGFueSkge1xuICAgICAgICBjb25zdCBuZHggPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjaW5kZXggdHIudGFibGUtYWN0aXZlJykgYXMgSFRNTFRhYmxlUm93RWxlbWVudDtcbiAgICAgICAgY29uc3QgZm9ybURhdGEgPSBuZXcgRm9ybURhdGEoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI0ZpZWxkRWRpdCBmb3JtJykgYXMgSFRNTEZvcm1FbGVtZW50KTtcbiAgICAgICAgbGV0IGZkdCA9IE9iamVjdC5mcm9tRW50cmllcyhmb3JtRGF0YSBhcyBhbnkpO1xuICAgICAgICBjb25zdCBba2V5LCB2YWx1ZV0gPSBPYmplY3QuZW50cmllcyhmZHQpWzBdO1xuXG4gICAgICAgIGlmIChrZXkuc3RhcnRzV2l0aCgnRksnKS8qICYmIGtleS5lbmRzV2l0aCgnX2lkJykqLykge1xuICAgICAgICAgICAgY29uc3Qgb3B0aW9uID0gQXJyYXkuZnJvbShkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKGAjJHtrZXl9IG9wdGlvbmApKS5maW5kKChvcHQ6IGFueSkgPT4gb3B0LnZhbHVlID09PSB2YWx1ZSkgYXMgYW55O1xuICAgICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnNsaWNlKDIpO1xuICAgICAgICAgICAgY29uc3QgcGtWYWx1ZSA9IHZhbHVlID8gb3B0aW9uPy5kYXRhc2V0LnBrIDogJyc7XG4gICAgICAgICAgICBmZHRbZmllbGROYW1lXSA9IHBrVmFsdWU7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIElmIHRoZSByb3cgY29udGFpbnMgdGhlIFwiX2lkXCIgc3VmZml4ZWQgZmllbGQgaW5zdGVhZCBvZiB0aGUgYmFzZSBmaWVsZCwgbWFwIHRoYXQgdG9vXG4gICAgICAgICAgICBjb25zdCByb3cgPSB0aGlzLmNvbGxlY3Rpb25bbmR4LnJvd0luZGV4IC0gMV0gYXMgYW55O1xuICAgICAgICAgICAgaWYgKHJvdyAmJiAhKGZpZWxkTmFtZSBpbiByb3cpICYmICgoZmllbGROYW1lICsgJ19pZCcpIGluIHJvdykpIHtcbiAgICAgICAgICAgICAgICBmZHRbZmllbGROYW1lICsgJ19pZCddID0gcGtWYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoZG9jdW1lbnQucXVlcnlTZWxlY3RvcignI2luZGV4IHRyLnRhYmxlLWFjdGl2ZSBpbnB1dDpjaGVja2VkJykpIHtcbiAgICAgICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJyNpbmRleCB0Ym9keSB0ciBpbnB1dDpjaGVja2VkJylcbiAgICAgICAgICAgICAgICAuZm9yRWFjaChuID0+IE9iamVjdC5hc3NpZ24odGhpcy5jb2xsZWN0aW9uWyhuLmNsb3Nlc3QoJ3RyJykgYXMgSFRNTFRhYmxlUm93RWxlbWVudCkucm93SW5kZXggLSAxXSBhcyBhbnksIGZkdCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgT2JqZWN0LmFzc2lnbih0aGlzLmNvbGxlY3Rpb25bbmR4LnJvd0luZGV4IC0gMV0gYXMgYW55LCBmZHQpO1xuICAgICAgICB0aGlzLkZpZWxkRWRpdCEuaGlkZSgpO1xuICAgICAgICB0aGlzLmVuYl9zYXZlKCk7XG4gICAgfVxufVxuXG5cbmV4cG9ydCBjbGFzcyBBZG1pbmVyRWRpdCBleHRlbmRzIGRiX2NydWQge1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICBpZiAoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlbC1hcHAnKSkge1xuICAgICAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3NlbC1hcHAnKSEub25jaGFuZ2UgPSAoZTogYW55KSA9PiB0aGlzLnNldEFwcChlKTtcbiAgICAgICAgICAgIGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdhcHAtbW9kZWwnKSEub25jaGFuZ2UgPSAoZTogYW55KSA9PiB0aGlzLmxvYWRNb2RlbChlKTtcblxuICAgICAgICAgICAgLy8gRGVmYXVsdCB0byBsb2FkaW5nIGN1c3RvbWVyX09yZGVyIGF1dG9tYXRpY2FsbHkgaWYgbGFuZGluZyBvbiB0aGUgbWFpbiAvc2FzdHJ5LyBwYWdlXG4gICAgICAgICAgICBjb25zdCBwYXRoID0gd2luZG93LmxvY2F0aW9uLnBhdGhuYW1lO1xuICAgICAgICAgICAgaWYgKHBhdGggPT09ICcvc2FzdHJ5LycgfHwgcGF0aCA9PT0gJy9zYXN0cnkvaW5kZXgvJykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlbEFwcCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzZWwtYXBwJykgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgY29uc3QgYXBwTW9kZWwgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwLW1vZGVsJykgYXMgSFRNTElucHV0RWxlbWVudDtcbiAgICAgICAgICAgICAgICBpZiAoc2VsQXBwICYmIGFwcE1vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbEFwcC52YWx1ZSA9ICdjdXN0b21lcic7XG4gICAgICAgICAgICAgICAgICAgIGFwcE1vZGVsLnZhbHVlID0gJ2N1c3RvbWVyX09yZGVyJztcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sb2FkTW9kZWwoeyB0YXJnZXQ6IGFwcE1vZGVsIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBzZXRBcHAoZTogYW55KSB7XG4gICAgICAgIChkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnYXBwLW1vZGVsJykgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWUgPSBlLnRhcmdldC52YWx1ZSArICdfJztcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcC1tb2RlbCcpIS5mb2N1cygpO1xuICAgIH1cbiAgICBsb2FkTW9kZWwoZTogYW55KSB7XG4gICAgICAgIGxldCBhcHBfbWRsID0gZS50YXJnZXQudmFsdWU7XG4gICAgICAgIGlmIChlLnRhcmdldC50YWdOYW1lID09ICdBJykge1xuICAgICAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgYXBwX21kbCA9IGUudGFyZ2V0LmdldEF0dHJpYnV0ZSgnaHJlZicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuaHJlZiA9ICh3aW5kb3cubG9jYXRpb24ucGF0aG5hbWUuc3RhcnRzV2l0aCgnL3Nhc3RyeS8nKSA/ICcvc2FzdHJ5LycgOiAnL2luZGV4LycpICsgYXBwX21kbC5yZXBsYWNlKCdfJywgJy8nKSArICcvJztcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2NvbnRlbnRfZCcpIS5pbm5lckhUTUwgPSB0aGlzLnNwaW5uZXI7XG4gICAgICAgIGZldGNoKHRoaXMuaHJlZiArICd7fScpXG4gICAgICAgICAgICAudGhlbihyZXNwb25zZSA9PiByZXNwb25zZS50ZXh0KCkpXG4gICAgICAgICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnY29udGVudF9kJykhLmlubmVySFRNTCA9IGRhdGE7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXREYXRhKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IGNvbnNvbGUuZXJyb3IoJ0Vycm9yOicsIGVycm9yKSk7XG4gICAgfVxufVxuKHdpbmRvdyBhcyBhbnkpLmRiX2NydWQgPSBkYl9jcnVkO1xuKHdpbmRvdyBhcyBhbnkpLkFkbWluZXJFZGl0ID0gQWRtaW5lckVkaXQ7XG4iXX0=