/**
 * Sastry Entity Relations (ER) Diagram Engine
 * Interactive, high-performance visual ER diagram and schema inspector for Django.
 *
 * @license MIT
 * @author Krishnamurthy (Global Multimedia)
 */

interface FieldMetadata {
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

type RelatedFieldTuple = [columnType: string, kind: string | null];

interface ActiveTableModel {
  FieldSeq: string[];
  has_many?: string[];
  app_label?: string;
  model_name?: string;
  verbose_name?: string;
  sel_many?: Record<string, boolean>;
  [fieldName: string]: any;
}

interface RelatedTableModel {
  FieldSeq: string[];
  [fieldName: string]: any;
}

interface ERDiagramPayload {
  main_table: string;
  app_label: string;
  model_name: string;
  lvt: ActiveTableModel;
  foreign: Record<string, RelatedTableModel>;
  has_many: Record<string, RelatedTableModel>;
}

interface ERDiagramOptions {
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

interface ElementRelativeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}


class SastryERDiagram {
  private container: HTMLElement | null;
  private viewport: HTMLElement | null;
  private stage: HTMLElement | null;
  private canvas: HTMLCanvasElement | null;
  private nodesLayer: HTMLElement | null;
  private sidebarLeft: HTMLElement | null;
  private inspectorBody: HTMLElement | null;
  private currentModelTitle: HTMLElement | null;
  private searchInput: HTMLInputElement | null;
  private zoomLevelEl: HTMLElement | null = null;

  public zoom: number = 1;
  public panX: number = 0;
  public panY: number = 0;
  private isPanning: boolean = false;
  private startX: number = 0;
  private startY: number = 0;

  public activeApp: string;
  public activeModel: string;
  public currentData: ERDiagramPayload | null = null;
  public selectedField: string | null = null;
  private lastClickedFk: string | null = null;
  private cache: Map<string, ERDiagramPayload> = new Map();

  // Color palette for foreign key connection lines
  private readonly fkColors: string[] = [
    '#0284c7', // Sky blue
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#f97316', // Orange
    '#10b981', // Emerald
    '#6366f1', // Indigo
    '#14b8a6', // Teal
    '#d946ef', // Fuchsia
    '#eab308', // Amber
    '#ef4444', // Red
    '#06b6d4', // Cyan
    '#84cc16'  // Lime
  ];

  private readonly icons: Record<string, string> = {
    'PrimaryKey': '<i class="bi bi-key-fill text-warning"></i>',
    'ForeignKey': '<i class="bi bi-arrow-left-circle-fill text-primary"></i>',
    'ManyToManyField': '<i class="bi bi-arrows-angle-expand text-info"></i>',
    'CheckBox': '<i class="bi bi-check-square-fill text-success"></i>',
    'Date': '<i class="bi bi-calendar-event text-danger"></i>',
    'Time': '<i class="bi bi-clock text-secondary"></i>',
    'Email': '<i class="bi bi-envelope text-primary"></i>',
    'File': '<i class="bi bi-file-earmark-text text-info"></i>',
    'Image': '<i class="bi bi-image text-success"></i>',
    'Number': '<i class="bi bi-hash text-warning"></i>',
    'TextArea': '<i class="bi bi-textarea-resize text-secondary"></i>',
    'Text': '<i class="bi bi-fonts text-body-secondary"></i>'
  };

  constructor(options: ERDiagramOptions = {}) {
    this.container = document.querySelector(options.containerSelector || '#erDiagramContainer');
    this.viewport = document.querySelector(options.viewportSelector || '#erViewport');
    this.stage = document.querySelector('#erStage');
    this.canvas = document.querySelector(options.canvasSelector || '#erCanvas');
    this.nodesLayer = document.querySelector(options.nodesSelector || '#erNodesLayer');
    this.sidebarLeft = document.querySelector(options.sidebarLeftSelector || '#erSidebarLeft');
    this.inspectorBody = document.querySelector(options.inspectorBodySelector || '#erInspectorBody');
    this.currentModelTitle = document.querySelector(options.currentModelTitleSelector || '#erCurrentModelTitle');
    this.searchInput = document.querySelector(options.searchInputSelector || '#erSearchInput');
    this.zoomLevelEl = document.querySelector('#erZoomLevel');

    this.activeApp = options.defaultApp || ((document.querySelector('.er-app-group') as HTMLElement)?.dataset.app || '');
    this.activeModel = options.defaultModel || ((document.querySelector('.er-model-item') as HTMLElement)?.dataset.model || '');

    this.init();
  }

  private init(): void {
    this.bindEvents();
    if (this.activeApp && this.activeModel) {
      this.loadModel(this.activeApp, this.activeModel);
    }
  }

  private bindEvents(): void {
    // Model search filtering
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        this.filterModelList(target.value);
      });
    }

    // Left sidebar model selection
    if (this.sidebarLeft) {
      this.sidebarLeft.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const item = target.closest('.er-model-item') as HTMLElement | null;
        if (item) {
          const app = item.dataset.app;
          const model = item.dataset.model;
          if (app && model) {
            this.loadModel(app, model);
          }
        }
      });
    }

    // Table clicks inside viewport (clicking any other table selects it and moves it to right)
    if (this.nodesLayer) {
      this.nodesLayer.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const clickedCard = target.closest('.er-table-card') as HTMLElement | null;
        if (!clickedCard) return;

        const isActiveTable = clickedCard.classList.contains('active-table');
        const cardTableKey = clickedCard.dataset.label; // e.g. "epic.Kingdom"

        // 1. Clicked on ANY other table on the canvas (not active table):
        if (!isActiveTable) {
          // Check if specifically clicked on a foreign key badge pointing to a 3rd model:
          const fieldRow = target.closest('.er-field-row') as HTMLElement | null;
          if (fieldRow) {
            const colType = fieldRow.dataset.type;
            const kind = fieldRow.dataset.kind;
            if (colType === 'ForeignKey' && kind && kind.includes('.')) {
              const [targetApp, targetModel] = kind.split('.');
              this.loadModel(targetApp, targetModel);
              return;
            }
          }
          // Clicking anywhere on this table makes it the selected table and moves it to right!
          if (cardTableKey && cardTableKey.includes('.')) {
            const [app, mdl] = cardTableKey.split('.');
            this.loadModel(app, mdl);
            return;
          }
        }

        // 2. Clicked inside the active table (selected table on the right):
        const fieldRow = target.closest('.er-field-row') as HTMLElement | null;
        if (fieldRow) {
          const colType = fieldRow.dataset.type;
          const kind = fieldRow.dataset.kind;
          const fieldName = fieldRow.dataset.field;

          if (colType === 'ForeignKey' && kind && kind.includes('.')) {
            const [targetApp, targetModel] = kind.split('.');
            const clickedBadge = !!target.closest('.er-fk-badge');
            const targetCard = document.getElementById(`er-card-${kind.replace(/[^a-zA-Z0-9_-]/g, '_')}`);

            if (clickedBadge || !targetCard || this.lastClickedFk === fieldName) {
              this.lastClickedFk = null;
              this.loadModel(targetApp, targetModel);
              return;
            }

            this.lastClickedFk = fieldName || null;
            if (fieldName) {
              this.selectField(fieldName);
            }
            this.highlightAndScrollToNode(kind);
            return;
          }

          this.lastClickedFk = null;
          if (fieldName) {
            this.selectField(fieldName);
          }
        }
      });

      // Double click on any foreign key row immediately jumps to the related model
      this.nodesLayer.addEventListener('dblclick', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const fieldRow = target.closest('.er-field-row') as HTMLElement | null;
        if (fieldRow) {
          const colType = fieldRow.dataset.type;
          const kind = fieldRow.dataset.kind;
          if (colType === 'ForeignKey' && kind && kind.includes('.')) {
            const [targetApp, targetModel] = kind.split('.');
            this.loadModel(targetApp, targetModel);
          }
        }
      });
    }

    // Redraw connections on window resize
    window.addEventListener('resize', () => this.redraw());

    // Viewport Pan (drag background) and Zoom (mouse wheel)
    if (this.viewport) {
      this.viewport.addEventListener('wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
      this.viewport.addEventListener('mousedown', (e: MouseEvent) => this.onMouseDown(e));
      window.addEventListener('mousemove', (e: MouseEvent) => this.onMouseMove(e));
      window.addEventListener('mouseup', () => this.onMouseUp());
    }

    // Floating Zoom Controls
    const btnZoomIn = document.getElementById('erZoomIn');
    if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.zoomBy(1.2));

    const btnZoomOut = document.getElementById('erZoomOut');
    if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.zoomBy(0.8));

    const btnZoomReset = document.getElementById('erZoomReset');
    if (btnZoomReset) btnZoomReset.addEventListener('click', () => this.zoomReset());

    const btnZoomFit = document.getElementById('erZoomFit');
    if (btnZoomFit) btnZoomFit.addEventListener('click', () => this.zoomFit());
  }

  public applyTransform(): void {
    if (this.stage) {
      this.stage.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
    if (this.zoomLevelEl) {
      this.zoomLevelEl.textContent = `${Math.round(this.zoom * 100)}%`;
    }
    if (this.viewport) {
      this.viewport.style.backgroundPosition = `${this.panX}px ${this.panY}px`;
      this.viewport.style.backgroundSize = `${20 * this.zoom}px ${20 * this.zoom}px`;
    }
  }

  public zoomBy(factor: number): void {
    if (!this.viewport) return;
    const rect = this.viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const newZoom = Math.min(2.5, Math.max(0.25, this.zoom * factor));
    this.panX = centerX - ((centerX - this.panX) / this.zoom) * newZoom;
    this.panY = centerY - ((centerY - this.panY) / this.zoom) * newZoom;
    this.zoom = newZoom;
    this.applyTransform();
  }

  public zoomReset(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
  }

  public zoomFit(): void {
    if (!this.viewport || !this.nodesLayer) return;
    const allCards = Array.from(this.nodesLayer.querySelectorAll('.er-table-card')) as HTMLElement[];
    if (allCards.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    allCards.forEach(card => {
      const x = parseFloat(card.style.left) || 0;
      const y = parseFloat(card.style.top) || 0;
      const w = card.offsetWidth || 280;
      const h = card.offsetHeight || 260;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    });

    const contentW = Math.max(100, maxX - minX);
    const contentH = Math.max(100, maxY - minY);
    const viewW = this.viewport.clientWidth;
    const viewH = this.viewport.clientHeight;

    const padding = 40;
    const scaleX = (viewW - padding * 2) / contentW;
    const scaleY = (viewH - padding * 2) / contentH;
    this.zoom = Math.min(1.0, Math.max(0.25, Math.min(scaleX, scaleY)));

    const scaledContentW = contentW * this.zoom;
    const scaledContentH = contentH * this.zoom;
    this.panX = (viewW - scaledContentW) / 2 - minX * this.zoom;
    this.panY = (viewH - scaledContentH) / 2 - minY * this.zoom;

    this.applyTransform();
  }

  private onWheel(e: WheelEvent): void {
    if (!this.viewport) return;
    e.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(2.5, Math.max(0.25, this.zoom * factor));

    this.panX = mouseX - ((mouseX - this.panX) / this.zoom) * newZoom;
    this.panY = mouseY - ((mouseY - this.panY) / this.zoom) * newZoom;
    this.zoom = newZoom;

    this.applyTransform();
  }

  private onMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('.er-table-card') || target.closest('.er-zoom-controls')) {
      return;
    }
    if (e.button === 0 || e.button === 1) {
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      if (this.viewport) {
        this.viewport.classList.add('is-panning');
      }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isPanning) return;
    this.panX = e.clientX - this.startX;
    this.panY = e.clientY - this.startY;
    this.applyTransform();
  }

  private onMouseUp(): void {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.viewport) {
        this.viewport.classList.remove('is-panning');
      }
    }
  }

  public filterModelList(query: string): void {
    if (!this.sidebarLeft) return;
    const q = query.toLowerCase().trim();
    const items = this.sidebarLeft.querySelectorAll('.er-model-item') as NodeListOf<HTMLElement>;
    const groups = this.sidebarLeft.querySelectorAll('.er-app-group') as NodeListOf<HTMLElement>;

    items.forEach(item => {
      const text = item.textContent?.toLowerCase() || '';
      const match = text.includes(q);
      item.style.display = match ? 'flex' : 'none';
    });

    groups.forEach(group => {
      const visibleItems = group.querySelectorAll('.er-model-item:not([style*="display: none"])');
      group.style.display = visibleItems.length > 0 ? 'block' : 'none';
    });
  }

  public async loadModel(appLabel: string, modelName: string): Promise<void> {
    this.activeApp = appLabel;
    this.activeModel = modelName;

    // Highlight item in left sidebar
    if (this.sidebarLeft) {
      const allItems = this.sidebarLeft.querySelectorAll('.er-model-item');
      allItems.forEach(el => el.classList.remove('active'));
      const activeItem = this.sidebarLeft.querySelector(`.er-model-item[data-app="${appLabel}"][data-model="${modelName}"]`);
      if (activeItem) {
        activeItem.classList.add('active');
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }

    if (this.currentModelTitle) {
      this.currentModelTitle.textContent = `${appLabel}.${modelName}`;
    }

    // Check cache
    const cacheKey = `${appLabel}.${modelName}`;
    if (this.cache.has(cacheKey)) {
      this.currentData = this.cache.get(cacheKey)!;
      this.render();
      return;
    }

    // Fetch from API
    try {
      if (this.nodesLayer) {
        this.nodesLayer.innerHTML = `
          <div class="d-flex align-items-center justify-content-center p-5 text-muted" style="min-height: 400px;">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
            <span>Loading schema for <strong>${appLabel}.${modelName}</strong>...</span>
          </div>`;
      }
      const response = await fetch(`/sastry/er/api/${appLabel}/${modelName}/`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data: ERDiagramPayload = await response.json();
      this.cache.set(cacheKey, data);
      this.currentData = data;
      this.render();
    } catch (err: any) {
      console.error('Failed to load model schema:', err);
      if (this.nodesLayer) {
        this.nodesLayer.innerHTML = `
          <div class="alert alert-danger m-4" role="alert">
            <h6 class="alert-heading"><i class="bi bi-exclamation-triangle-fill me-2"></i>Error Loading Schema</h6>
            <p class="mb-0">${err.message || err}</p>
          </div>`;
      }
    }
  }

  public render(): void {
    if (!this.currentData || !this.currentData.lvt || !this.nodesLayer) return;
    this.nodesLayer.innerHTML = '';

    const { lvt, foreign, has_many, main_table } = this.currentData;

    // Build active table card (Selected Table - positioned on the FAR RIGHT)
    const activeCard = this.createTableCard(main_table, lvt, 'active-table', 'Selected Table');
    this.nodesLayer.appendChild(activeCard);

    // Identify all unique related tables (a table might be both foreign and has_many)
    const foreignKeys = Object.keys(foreign || {});
    const hasManyKeys = Object.keys(has_many || {});

    interface RelatedTableMeta {
      key: string;
      data: any;
      cardType: 'has-many-table' | 'foreign-table' | 'mutual-table';
      badge: string;
    }

    const relatedMap = new Map<string, RelatedTableMeta>();

    // First collect child tables (has_many)
    hasManyKeys.forEach(relKey => {
      relatedMap.set(relKey, {
        key: relKey,
        data: has_many[relKey],
        cardType: 'has-many-table',
        badge: 'Child Table'
      });
    });

    // Then process foreign key targets
    foreignKeys.forEach(fkKey => {
      if (relatedMap.has(fkKey)) {
        const existing = relatedMap.get(fkKey)!;
        existing.cardType = 'mutual-table';
        existing.badge = 'Ref & Child';
      } else {
        relatedMap.set(fkKey, {
          key: fkKey,
          data: foreign[fkKey],
          cardType: 'foreign-table',
          badge: 'Referenced Table'
        });
      }
    });

    // Create cards for each UNIQUE related table
    relatedMap.forEach(meta => {
      const card = this.createTableCard(meta.key, meta.data, meta.cardType, meta.badge);
      this.nodesLayer!.appendChild(card);
    });

    // Layout cards: Selected Table on the RIGHT, related tables distributed in columns on the LEFT
    this.layoutNodes(Array.from(relatedMap.keys()), main_table);

    // Select primary key field or first field
    const pkField = lvt.FieldSeq.find(f => {
      const fieldMeta = lvt[f] as FieldMetadata | undefined;
      return fieldMeta?.ColumnType === 'PrimaryKey';
    }) || lvt.FieldSeq[0];

    if (pkField) {
      this.selectField(pkField);
    }

    // Auto-fit cards comfortably into view
    this.zoomFit();

    // Draw canvas connector lines
    requestAnimationFrame(() => this.drawConnections());
  }

  private createTableCard(tableKey: string, data: any, cardTypeClass: string, badgeText: string): HTMLElement {
    const card = document.createElement('div');
    card.className = `er-table-card ${cardTypeClass}`;
    card.id = `er-card-${tableKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    card.dataset.label = tableKey;

    const shortName = tableKey.includes('.') ? tableKey.split('.')[1] : tableKey;
    const appName = tableKey.includes('.') ? tableKey.split('.')[0] : '';
    const iconClass = cardTypeClass === 'active-table' 
      ? 'bi-star-fill text-dark' 
      : (cardTypeClass === 'mutual-table'
        ? 'bi-arrow-left-right'
        : (cardTypeClass === 'has-many-table' ? 'bi-arrow-return-right' : 'bi-link-45deg'));

    const badgeLabel = cardTypeClass === 'active-table' 
      ? 'Selected' 
      : (cardTypeClass === 'mutual-table'
        ? 'Ref & Child ⇄'
        : (cardTypeClass === 'has-many-table' ? 'Child ↗' : 'Ref ↗'));

    let headerHtml = `
      <div class="er-table-header" title="${badgeText}: ${tableKey}">
        <div class="d-flex align-items-center text-truncate">
          <i class="bi ${iconClass} me-2"></i>
          <span class="text-truncate">${shortName}</span>
          ${appName ? `<span class="opacity-75 ms-1 small" style="font-size:0.7rem">(${appName})</span>` : ''}
        </div>
        <span class="er-table-badge">${badgeLabel}</span>
      </div>
      <div class="er-table-body">
    `;

    const seq: string[] = data.FieldSeq || [];
    seq.forEach(fieldName => {
      let colType = 'Text';
      let kind: string | null = null;
      if (cardTypeClass === 'active-table') {
        const fInfo = data[fieldName] as FieldMetadata | undefined;
        colType = fInfo?.ColumnType || 'Text';
        kind = fInfo?.kind || null;
      } else {
        const fTuple = data[fieldName];
        if (Array.isArray(fTuple)) {
          colType = fTuple[0];
          kind = fTuple[1];
        }
      }

      const icon = this.icons[colType] || this.icons['Text'];
      const isFk = colType === 'ForeignKey' && !!kind;
      const shortKind = (isFk && kind) ? (kind.includes('.') ? kind.split('.')[1] : kind) : '';
      headerHtml += `
        <div class="er-field-row ${isFk ? 'is-foreign-key' : ''}" 
             data-field="${fieldName}" 
             data-type="${colType}" 
             data-kind="${kind || ''}" 
             data-table="${tableKey}" 
             id="er-row-${tableKey.replace(/[^a-zA-Z0-9_-]/g, '_')}-${fieldName}">
          <span class="er-field-icon">${icon}</span>
          <span class="er-field-name ${colType === 'PrimaryKey' ? 'fw-bold' : ''}">${fieldName}</span>
          ${isFk ? `
            <span class="er-field-type er-fk-badge" title="Show ${shortKind} model (${kind})">
              ${shortKind} <i class="bi bi-box-arrow-in-right ms-1"></i>
            </span>
          ` : `
            <span class="er-field-type">${colType}</span>
          `}
        </div>
      `;
    });

    headerHtml += `</div>`;
    card.innerHTML = headerHtml;
    return card;
  }

  private layoutNodes(relatedKeys: string[], mainTableKey: string): void {
    if (!this.viewport || !this.nodesLayer) return;

    const cardSpacingX = 70;
    const cardSpacingY = 24;
    const colWidth = 280;
    const activeColWidth = 320;
    const startX = 60;

    const activeCard = document.getElementById(`er-card-${mainTableKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (!activeCard) return;

    const getCardHeight = (card: HTMLElement | null): number => {
      if (!card) return 260;
      return card.offsetHeight || (card.getBoundingClientRect().height / (this.zoom || 1)) || 260;
    };

    const activeCardH = getCardHeight(activeCard);
    const totalRelated = relatedKeys.length;

    // 0 related tables: center active card comfortably
    if (totalRelated === 0) {
      const activeTableX = Math.max(startX, (this.viewport.clientWidth - activeColWidth) / 2);
      const activeTableY = 60;
      activeCard.style.left = `${activeTableX}px`;
      activeCard.style.top = `${activeTableY}px`;

      const canvasWidth = Math.max(this.viewport.clientWidth, activeTableX + activeColWidth + 120);
      const canvasHeight = Math.max(this.viewport.clientHeight, activeTableY + activeCardH + 120);
      this.nodesLayer.style.width = `${canvasWidth}px`;
      this.nodesLayer.style.height = `${canvasHeight}px`;
      this.resizeCanvas(canvasWidth, canvasHeight);
      return;
    }

    // Number of columns: selected table on the right + up to 4 to its left (max 5 columns in row 0)
    const numCols = Math.min(5, totalRelated + 1);
    const selectedCol = numCols - 1; // Rightmost column index

    // Precompute X coordinates for each column
    const colXCoordinates: number[] = [];
    for (let c = 0; c < numCols; c++) {
      colXCoordinates.push(startX + c * (colWidth + cardSpacingX));
    }

    // Track vertical top position for each column (starting at Y = 50)
    const colHeights = new Array(numCols).fill(50);

    // Place Selected Table at Row 0 of the rightmost column
    activeCard.style.left = `${colXCoordinates[selectedCol]}px`;
    activeCard.style.top = `50px`;
    colHeights[selectedCol] += activeCardH + cardSpacingY;

    // Precompute heights of all related tables
    interface RelatedItem {
      key: string;
      card: HTMLElement;
      height: number;
    }

    const allRelatedItems: RelatedItem[] = [];
    for (const key of relatedKeys) {
      const card = document.getElementById(`er-card-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
      if (card) {
        allRelatedItems.push({
          key,
          card,
          height: getCardHeight(card)
        });
      }
    }

    // Sort related items by height (descending) so taller cards are placed first
    // and shorter cards fill the remaining gaps, balancing all column heights uniformly
    allRelatedItems.sort((a, b) => b.height - a.height);

    // First row: assign 1 card each to columns to the left of the selected table (0..selectedCol - 1)
    const firstRowCols = selectedCol; // e.g. 4 columns if numCols == 5
    const firstRowItems = allRelatedItems.slice(0, firstRowCols);
    const remainingItems = allRelatedItems.slice(firstRowCols);

    for (let c = 0; c < firstRowItems.length; c++) {
      const it = firstRowItems[c];
      it.card.style.left = `${colXCoordinates[c]}px`;
      it.card.style.top = `50px`;
      colHeights[c] += it.height + cardSpacingY;
    }

    // Remaining tables (if more than 5 tables total):
    // Greedily place each into the column with the minimum current height,
    // stacking directly below without unnecessary blank spaces
    for (const it of remainingItems) {
      let bestCol = 0;
      let minH = colHeights[0];
      for (let c = 1; c < numCols; c++) {
        if (colHeights[c] < minH) {
          minH = colHeights[c];
          bestCol = c;
        }
      }

      it.card.style.left = `${colXCoordinates[bestCol]}px`;
      it.card.style.top = `${colHeights[bestCol]}px`;
      colHeights[bestCol] += it.height + cardSpacingY;
    }

    // Canvas boundary sizing with padding
    const maxContentX = colXCoordinates[selectedCol] + activeColWidth;
    const canvasWidth = Math.max(this.viewport.clientWidth, maxContentX + 100);
    const maxColHeight = Math.max(...colHeights);
    const canvasHeight = Math.max(this.viewport.clientHeight, maxColHeight + 80);

    this.nodesLayer.style.width = `${canvasWidth}px`;
    this.nodesLayer.style.height = `${canvasHeight}px`;

    this.resizeCanvas(canvasWidth, canvasHeight);
  }

  private resizeCanvas(width: number, height: number): void {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }

  public drawConnections(): void {
    if (!this.currentData || !this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    const { lvt, foreign, has_many, main_table } = this.currentData;
    const activeCardId = `er-card-${main_table.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const activeCard = document.getElementById(activeCardId);
    if (!activeCard) return;

    // Find PK row of active table
    const pkFieldName = lvt.FieldSeq.find(f => {
      const fieldMeta = lvt[f] as FieldMetadata | undefined;
      return fieldMeta?.ColumnType === 'PrimaryKey';
    });
    const activePkRow = pkFieldName ? document.getElementById(`er-row-${main_table.replace(/[^a-zA-Z0-9_-]/g, '_')}-${pkFieldName}`) : null;

    // 1. Draw Incoming Reverse Relations (has_many) -> Pointing to Active Table PK
    if (activePkRow) {
      ctx.lineWidth = 1.5;
      const relStrokeColor = '#0891b2'; // Cyan/Teal
      ctx.strokeStyle = relStrokeColor;
      ctx.fillStyle = relStrokeColor;

      Object.keys(has_many || {}).forEach(relKey => {
        const relData = has_many[relKey];
        const relCardId = `er-card-${relKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const relCard = document.getElementById(relCardId);
        if (!relCard) return;

        // Find field in relData pointing to main_table
        const seq = relData.FieldSeq || [];
        seq.forEach(f => {
          const fTuple = relData[f];
          if (Array.isArray(fTuple) && fTuple[1] === main_table) {
            const relRow = document.getElementById(`er-row-${relKey.replace(/[^a-zA-Z0-9_-]/g, '_')}-${f}`);
            if (relRow) {
              const pts = this.getCardConnectionPoints(relRow, activePkRow);

              this.drawSpline(
                ctx,
                pts.startX,
                pts.startY,
                pts.endX,
                pts.endY,
                pts.startIsRight,
                pts.endIsRight,
                relStrokeColor
              );

              // Draw Arrowhead at active PK anchor
              this.drawArrowhead(ctx, pts.endX, pts.endY, pts.endIsRight, relStrokeColor);

              // Draw anchor dot at source row
              ctx.beginPath();
              ctx.arc(pts.startX, pts.startY, 3, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
        });
      });
    }

    // 2. Draw Outgoing Foreign Keys (Active Table FK -> Target Table PK)
    let colorIdx = 0;
    (lvt.FieldSeq || []).forEach(fieldName => {
      const fInfo = lvt[fieldName] as FieldMetadata | undefined;
      if (fInfo && fInfo.ColumnType === 'ForeignKey' && fInfo.kind) {
        const targetKey = fInfo.kind;
        const targetCardId = `er-card-${targetKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const targetCard = document.getElementById(targetCardId);
        const fkRow = document.getElementById(`er-row-${main_table.replace(/[^a-zA-Z0-9_-]/g, '_')}-${fieldName}`);

        if (targetCard && fkRow) {
          // Find PK row of target table
          const targetData = foreign[targetKey];
          let targetPkField = 'id';
          if (targetData && targetData.FieldSeq) {
            targetPkField = targetData.FieldSeq.find(f => {
              const tup = targetData[f];
              return Array.isArray(tup) && tup[0] === 'PrimaryKey';
            }) || 'id';
          }

          const targetPkRow = document.getElementById(`er-row-${targetKey.replace(/[^a-zA-Z0-9_-]/g, '_')}-${targetPkField}`);
          if (targetPkRow) {
            const strokeColor = this.fkColors[colorIdx % this.fkColors.length];
            colorIdx++;

            const pts = this.getCardConnectionPoints(fkRow, targetPkRow);

            this.drawSpline(
              ctx,
              pts.startX,
              pts.startY,
              pts.endX,
              pts.endY,
              pts.startIsRight,
              pts.endIsRight,
              strokeColor
            );

            // Draw small circle anchor at target PK
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(pts.endX, pts.endY, 4, 0, 2 * Math.PI);
            ctx.fill();

            // Draw small dot at start FK
            ctx.beginPath();
            ctx.arc(pts.startX, pts.startY, 3, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    });
  }

  private getCardConnectionPoints(
    sourceRow: HTMLElement,
    targetRow: HTMLElement
  ): {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startIsRight: boolean;
    endIsRight: boolean;
  } {
    const sourceCard = sourceRow.closest('.er-table-card') as HTMLElement | null;
    const targetCard = targetRow.closest('.er-table-card') as HTMLElement | null;

    const sourceCardLeft = sourceCard ? (parseFloat(sourceCard.style.left) || 0) : 0;
    const sourceCardWidth = sourceCard ? (sourceCard.offsetWidth || 280) : 280;
    const sourceCardRight = sourceCardLeft + sourceCardWidth;
    const sourceCardCenterX = sourceCardLeft + sourceCardWidth / 2;

    const targetCardLeft = targetCard ? (parseFloat(targetCard.style.left) || 0) : 0;
    const targetCardWidth = targetCard ? (targetCard.offsetWidth || 320) : 320;
    const targetCardRight = targetCardLeft + targetCardWidth;
    const targetCardCenterX = targetCardLeft + targetCardWidth / 2;

    let startIsRight = true;
    let endIsRight = false;

    // Direct left-to-right relation with gap
    if (sourceCardRight + 20 <= targetCardLeft) {
      startIsRight = true;
      endIsRight = false;
    } else if (targetCardRight + 20 <= sourceCardLeft) {
      // Direct right-to-left relation with gap
      startIsRight = false;
      endIsRight = true;
    } else if (sourceCardCenterX <= targetCardCenterX) {
      // Overlapping or vertical relation: source is to the left of target center
      startIsRight = false;
      endIsRight = false;
    } else {
      // Overlapping or vertical relation: source is to the right of target center
      startIsRight = true;
      endIsRight = true;
    }

    const startAnchor = this.getRowAnchor(sourceRow, startIsRight);
    const endAnchor = this.getRowAnchor(targetRow, endIsRight);

    return {
      startX: startAnchor.x,
      startY: startAnchor.y,
      endX: endAnchor.x,
      endY: endAnchor.y,
      startIsRight,
      endIsRight
    };
  }

  private drawArrowhead(
    ctx: CanvasRenderingContext2D,
    tipX: number,
    tipY: number,
    approachingFromRight: boolean,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    if (approachingFromRight) {
      // Arrowhead enters the right edge from the right: tip is at tipX
      ctx.lineTo(tipX + 7, tipY - 4);
      ctx.lineTo(tipX + 7, tipY + 4);
    } else {
      // Arrowhead enters the left edge from the left: tip is at tipX
      ctx.lineTo(tipX - 7, tipY - 4);
      ctx.lineTo(tipX - 7, tipY + 4);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawSpline(
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    startIsRight: boolean,
    endIsRight: boolean,
    color: string
  ): void {
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = color;

    const curvature = Math.min(140, Math.max(35, Math.abs(endX - startX) * 0.4 + Math.abs(endY - startY) * 0.15));
    const cp1X = startIsRight ? startX + curvature : startX - curvature;
    const cp1Y = startY;
    const cp2X = endIsRight ? endX + curvature : endX - curvature;
    const cp2Y = endY;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
    ctx.stroke();
  }

  private getRowAnchor(rowEl: HTMLElement, isRightSide: boolean): { x: number; y: number } {
    const parentRect = this.nodesLayer!.getBoundingClientRect();
    const rowRect = rowEl.getBoundingClientRect();
    const cardEl = rowEl.closest('.er-table-card') as HTMLElement | null;

    const z = this.zoom || 1;
    const y = (rowRect.top - parentRect.top) / z + (rowRect.height / 2) / z;
    const cardRect = cardEl ? cardEl.getBoundingClientRect() : rowRect;
    const x = isRightSide
      ? (cardRect.right - parentRect.left) / z
      : (cardRect.left - parentRect.left) / z;

    return { x, y };
  }

  private getRelativeRect(element: HTMLElement): ElementRelativeRect {
    const elRect = element.getBoundingClientRect();
    const parentRect = this.nodesLayer!.getBoundingClientRect();
    const z = this.zoom || 1;
    return {
      left: (elRect.left - parentRect.left) / z,
      top: (elRect.top - parentRect.top) / z,
      right: (elRect.right - parentRect.left) / z,
      bottom: (elRect.bottom - parentRect.top) / z,
      width: elRect.width / z,
      height: elRect.height / z
    };
  }

  public selectField(fieldName: string): void {
    if (!this.nodesLayer || !this.currentData) return;
    this.selectedField = fieldName;

    // Highlight row in active table
    const allRows = this.nodesLayer.querySelectorAll('.er-table-card.active-table .er-field-row');
    allRows.forEach(r => r.classList.remove('selected-field'));
    const targetRow = document.getElementById(`er-row-${this.currentData.main_table.replace(/[^a-zA-Z0-9_-]/g, '_')}-${fieldName}`);
    if (targetRow) {
      targetRow.classList.add('selected-field');
    }

    // Render inspector sidebar
    this.renderInspector(fieldName);
  }

  private renderInspector(fieldName: string): void {
    if (!this.inspectorBody || !this.currentData || !this.currentData.lvt) return;
    const fInfo = this.currentData.lvt[fieldName] as FieldMetadata | undefined;
    if (!fInfo) {
      this.inspectorBody.innerHTML = `<div class="text-muted small">Select a field to view properties.</div>`;
      return;
    }

    const { has_many } = this.currentData;

    const badges: string[] = [];
    if (fInfo.ColumnType === 'PrimaryKey') badges.push('<span class="er-badge-pill badge-pk">Primary Key</span>');
    if (fInfo.ColumnType === 'ForeignKey') badges.push('<span class="er-badge-pill badge-fk">Foreign Key</span>');
    if (fInfo.null) badges.push('<span class="er-badge-pill badge-null">Nullable</span>');
    if (fInfo.blank) badges.push('<span class="er-badge-pill badge-null">Blank</span>');
    if (fInfo.unique) badges.push('<span class="er-badge-pill badge-uniq">Unique</span>');
    if (fInfo.dbindex) badges.push('<span class="er-badge-pill badge-idx">Indexed</span>');

    let html = `
      <div class="er-prop-group">
        <div class="er-prop-label">Field Name</div>
        <div class="er-prop-val fw-bold text-primary font-monospace">${fieldName}</div>
      </div>

      <div class="er-prop-group">
        <div class="er-prop-label">Verbose Name</div>
        <div class="er-prop-val">${fInfo.lbl || fieldName}</div>
      </div>

      <div class="er-prop-group">
        <div class="er-prop-label">Column / Internal Type</div>
        <div class="er-prop-val">
          <span class="badge bg-secondary me-1">${fInfo.ColumnType}</span>
          <span class="badge bg-light text-dark border">${fInfo.internal_type || ''}</span>
        </div>
      </div>

      <div class="er-prop-group">
        <div class="er-prop-label">Attributes</div>
        <div class="mt-1">${badges.join(' ') || '<span class="text-muted small">Standard field</span>'}</div>
      </div>
    `;

    // If Foreign Key, provide a jump button
    if (fInfo.ColumnType === 'ForeignKey' && fInfo.kind) {
      const targetLabel = fInfo.kind;
      html += `
        <div class="er-prop-group mt-3 pt-2 border-top">
          <div class="er-prop-label">Target Reference</div>
          <div class="er-prop-val mb-2 font-monospace small">${targetLabel}</div>
          <button type="button" class="btn btn-sm btn-outline-primary w-100" onclick="window.sastryER.jumpToModel('${targetLabel}')">
            <i class="bi bi-box-arrow-in-right me-1"></i> Jump to ${targetLabel.split('.')[1] || targetLabel}
          </button>
        </div>
      `;
    }

    // If Primary Key, display reverse relation counts
    if (fInfo.ColumnType === 'PrimaryKey') {
      const revKeys = Object.keys(has_many || {});
      html += `
        <div class="er-prop-group mt-3 pt-2 border-top">
          <div class="er-prop-label">Referenced By (${revKeys.length} Models)</div>
          <div class="list-group list-group-flush small mt-1">
            ${revKeys.map(k => `
              <a href="#" class="list-group-item list-group-item-action py-1 px-2 d-flex justify-content-between align-items-center" onclick="window.sastryER.jumpToModel('${k}'); return false;">
                <span>${k.split('.')[1] || k}</span>
                <i class="bi bi-chevron-right text-muted" style="font-size:0.7rem"></i>
              </a>
            `).join('')}
          </div>
        </div>
      `;
    }

    this.inspectorBody.innerHTML = html;
  }

  public jumpToModel(fullLabel: string): void {
    if (fullLabel && fullLabel.includes('.')) {
      const [app, mdl] = fullLabel.split('.');
      this.loadModel(app, mdl);
    }
  }

  public highlightAndScrollToNode(tableKey: string): void {
    const cardId = `er-card-${tableKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const card = document.getElementById(cardId);
    if (!card || !this.viewport) return;

    const cardLeft = parseFloat(card.style.left) || 0;
    const cardTop = parseFloat(card.style.top) || 0;
    const cardW = card.offsetWidth || 280;
    const cardH = card.offsetHeight || 260;

    const viewW = this.viewport.clientWidth;
    const viewH = this.viewport.clientHeight;

    this.panX = (viewW / 2) - (cardLeft + cardW / 2) * this.zoom;
    this.panY = (viewH / 2) - (cardTop + cardH / 2) * this.zoom;
    this.applyTransform();

    card.classList.remove('er-card-pulse');
    void card.offsetWidth; // Force DOM reflow
    card.classList.add('er-card-pulse');
  }

  public redraw(): void {
    if (this.currentData) {
      this.render();
    }
  }
}

// Export globally for browser script tag usage
(window as any).SastryERDiagram = SastryERDiagram;

// Global initialization helper
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('erDiagramContainer');
  if (container) {
    const defaultApp = container.dataset.defaultApp || ((document.querySelector('.er-app-group') as HTMLElement)?.dataset.app || '');
    const defaultModel = container.dataset.defaultModel || ((document.querySelector('.er-model-item') as HTMLElement)?.dataset.model || '');
    (window as any).sastryER = new SastryERDiagram({
      defaultApp,
      defaultModel
    });
  }
});

