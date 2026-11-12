/**
 * Make a POST request with CSRF token (Standalone helper)
 */
export declare function postWithCsrf(url: string, formData: FormData): Promise<Response>;
export declare class db_crud<T extends {
    id?: string | number;
    [key: string]: any;
} = any> {
    collection: T[];
    xpos: number;
    lkup: any;
    fields: any[];
    href: string | null;
    form: string | null;
    modififed: boolean;
    ndx: number | null;
    sel_rows: number[];
    spinner: string;
    tmpl: any;
    csrf: string | null;
    filter: any;
    FilterOR: boolean;
    exclude: any;
    FieldEdit: any;
    constructor();
    setData(): void;
    render(): void;
    ShowTab(w: string): void;
    PageNumKeyUp(e: any): void;
    RowPP_KeyUp(e: any): void;
    changeRowsPM10(e: any): void;
    hide_columns(e: any): void;
    set_hide(e: any): void;
    tbodyRender(): void;
    rowSelect(e: any): void;
    trSetSelected(tr: HTMLTableRowElement): void;
    DeleteRecords(e: any): void;
    SaveRecords(e?: any): void;
    setResetAll(e: any): void;
    setSelCount(): void;
    setMain(e: any): void;
    setIcon(): void;
    enb_save(): void;
    FormEdit_keyup(e: any): false | undefined;
    SaveModel(): void;
    imgSave(e: any): void;
    ApplyFilter(e: any): void;
    addElement(s: any, opt: string): void;
    showCruFilter(e?: any): void;
    setFormData(ndx: number): void;
    setEdit(e: any): void;
    setFormHt(which?: string): void;
    changeDir(e: any): void;
    loadPageNum(e?: any): void;
    changeRowsPP(e: any): void;
    setColl(page_num: number): void;
    download(e: any): void;
    setTables(data: any): void;
    cellEdit(e: any): false | any[] | null | undefined;
    cellSave(e: any): void;
}
export declare class AdminerEdit extends db_crud {
    constructor();
    setApp(e: any): void;
    loadModel(e: any): void;
}
