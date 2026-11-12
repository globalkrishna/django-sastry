import { AdminerEdit } from './s_crud.js';

var adminer_crud = null;

function resizeAdminer() {
    const m = document.querySelector('main');
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    let ddh = window.innerHeight - m.offsetTop - document.querySelector('footer').offsetHeight;
    // @ts-expect-error TS(2531): Object is possibly 'null'.
    m.style.height = `${ddh}px`;
}

document.addEventListener('DOMContentLoaded', function () {
    adminer_crud = new AdminerEdit();
    resizeAdminer();
    if (window.location.search.length) {
        // @ts-expect-error TS(2345): Argument of type 'null' is not assignable to param... Remove this comment to see the full error message
        history.replaceState({}, null, "/");

        view.crud.setData();
    }
}, false);

