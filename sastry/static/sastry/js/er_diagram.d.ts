/**
 * Sastry Entity Relations (ER) Diagram Engine
 * Interactive, high-performance visual ER diagram and schema inspector for Django.
 *
 * @license MIT
 * @author Krishnamurthy (Global Multimedia)
 */
export interface FieldMetadata {
    ColumnType: string;
    lbl?: string;
    null?: boolean;
    blank?: boolean;
    editable?: boolean;
    unique?: boolean;
    dbindex?: boolean;
    kind?: string | null;
    internal_type?: string;
}
export type RelatedFieldTuple = [columnType: string, kind: string | null];
export interface ActiveTableModel {
    FieldSeq: string[];
    has_many?: string[];
    app_label?: string;
    model_name?: string;
    verbose_name?: string;
    sel_many?: Record<string, boolean>;
    [fieldName: string]: any;
}
export interface RelatedTableModel {
    FieldSeq: string[];
    [fieldName: string]: any;
}
export interface ERDiagramPayload {
    main_table: string;
    app_label: string;
    model_name: string;
    lvt: ActiveTableModel;
    foreign: Record<string, RelatedTableModel>;
    has_many: Record<string, RelatedTableModel>;
}
export interface ERDiagramOptions {
    containerSelector?: string;
    viewportSelector?: string;
    canvasSelector?: string;
    nodesSelector?: string;
    sidebarLeftSelector?: string;
    inspectorBodySelector?: string;
    currentModelTitleSelector?: string;
    searchInputSelector?: string;
    defaultApp?: string;
    defaultModel?: string;
}
export interface ElementRelativeRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}
export declare class SastryERDiagram {
    private container;
    private viewport;
    private canvas;
    private nodesLayer;
    private sidebarLeft;
    private inspectorBody;
    private currentModelTitle;
    private searchInput;
    activeApp: string;
    activeModel: string;
    currentData: ERDiagramPayload | null;
    selectedField: string | null;
    private cache;
    private readonly fkColors;
    private readonly icons;
    constructor(options?: ERDiagramOptions);
    private init;
    private bindEvents;
    filterModelList(query: string): void;
    loadModel(appLabel: string, modelName: string): Promise<void>;
    render(): void;
    private createTableCard;
    private layoutNodes;
    private resizeCanvas;
    drawConnections(): void;
    private getRelativeRect;
    selectField(fieldName: string): void;
    private renderInspector;
    jumpToModel(fullLabel: string): void;
    redraw(): void;
}
