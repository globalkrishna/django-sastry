import { AdminerEdit } from './s_crud.js';
var adminer_crud = null;
function resizeAdminer() {
    const m = document.querySelector('main');
    if (m) {
        const footer = document.querySelector('footer');
        const footerHeight = footer ? footer.offsetHeight : 0;
        let ddh = window.innerHeight - m.offsetTop - footerHeight;
        m.style.height = `${ddh}px`;
    }
}
document.addEventListener('DOMContentLoaded', function () {
    adminer_crud = new AdminerEdit();
    resizeAdminer();
    if (window.location.search.length) {
        history.replaceState({}, '', "/");
        if (typeof view !== 'undefined' && view?.crud) {
            view.crud.setData();
        }
    }
}, false);
