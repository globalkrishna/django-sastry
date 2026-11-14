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
  svgSelector?: string;
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
  private svgLayer: SVGSVGElement | null;
  private svgGroup: SVGGElement | null;
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

  // Interactive Card Dragging State
  private isDraggingCard: boolean = false;
  private draggedCard: HTMLElement | null = null;
  private cardDragStartX: number = 0;
  private cardDragStartY: number = 0;
  private cardInitialLeft: number = 0;
  private cardInitialTop: number = 0;
  private hasCardMoved: boolean = false;
  private justDraggedCard: boolean = false;

  // Touch & Pinch-to-Zoom State
  private touchStartDistance: number = 0;
  private touchStartZoom: number = 1;
  private touchCenterX: number = 0;
  private touchCenterY: number = 0;

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
    this.svgLayer = document.querySelector(options.svgSelector || '#erSvg');
    this.svgGroup = document.querySelector('#erConnectionsGroup');
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
      // 0. Card dragging via mousedown on table header
      this.nodesLayer.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('.er-fk-badge')) return; // Allow clicking FK jump badge

        const header = target.closest('.er-table-header') as HTMLElement | null;
        const card = target.closest('.er-table-card') as HTMLElement | null;
        if (header && card) {
          this.isDraggingCard = true;
          this.draggedCard = card;
          this.cardDragStartX = e.clientX;
          this.cardDragStartY = e.clientY;
          this.cardInitialLeft = parseFloat(card.style.left) || 0;
          this.cardInitialTop = parseFloat(card.style.top) || 0;
          this.hasCardMoved = false;
          e.stopPropagation();
        }
      });

      this.nodesLayer.addEventListener('click', (e: MouseEvent) => {
        if (this.justDraggedCard) {
          return;
        }
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

    // Viewport Pan (drag background) and Zoom (mouse wheel & touch)
    if (this.viewport) {
      this.viewport.addEventListener('wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
      this.viewport.addEventListener('mousedown', (e: MouseEvent) => this.onMouseDown(e));
      window.addEventListener('mousemove', (e: MouseEvent) => this.onMouseMove(e));
      window.addEventListener('mouseup', () => this.onMouseUp());

      // Touch events for mobile/tablet pinch & drag
      this.viewport.addEventListener('touchstart', (e: TouchEvent) => this.onTouchStart(e), { passive: false });
      window.addEventListener('touchmove', (e: TouchEvent) => this.onTouchMove(e), { passive: false });
      window.addEventListener('touchend', () => this.onTouchEnd());
      window.addEventListener('touchcancel', () => this.onTouchEnd());
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

    // Export Controls
    const btnExportSvg = document.getElementById('erExportSvg');
    if (btnExportSvg) btnExportSvg.addEventListener('click', () => this.exportSvg());

    const btnExportPng = document.getElementById('erExportPng');
    if (btnExportPng) btnExportPng.addEventListener('click', () => this.exportPng());
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
    if (this.isDraggingCard && this.draggedCard) {
      const dist = Math.hypot(e.clientX - this.cardDragStartX, e.clientY - this.cardDragStartY);
      if (!this.hasCardMoved && dist > 4) {
        this.hasCardMoved = true;
        this.draggedCard.classList.add('is-dragging');
      }
      if (this.hasCardMoved) {
        const dx = (e.clientX - this.cardDragStartX) / (this.zoom || 1);
        const dy = (e.clientY - this.cardDragStartY) / (this.zoom || 1);
        const newLeft = Math.max(10, this.cardInitialLeft + dx);
        const newTop = Math.max(10, this.cardInitialTop + dy);
        this.draggedCard.style.left = `${newLeft}px`;
        this.draggedCard.style.top = `${newTop}px`;

        if (this.nodesLayer) {
          const cardRight = newLeft + this.draggedCard.offsetWidth + 120;
          const cardBottom = newTop + this.draggedCard.offsetHeight + 120;
          const curW = parseFloat(this.nodesLayer.style.width) || 0;
          const curH = parseFloat(this.nodesLayer.style.height) || 0;
          let changed = false;
          let nextW = curW;
          let nextH = curH;
          if (cardRight > curW) { nextW = cardRight; changed = true; }
          if (cardBottom > curH) { nextH = cardBottom; changed = true; }
          if (changed) {
            this.nodesLayer.style.width = `${nextW}px`;
            this.nodesLayer.style.height = `${nextH}px`;
            this.resizeSvg(nextW, nextH);
          }
        }

        this.drawConnections();
      }
      return;
    }

    if (!this.isPanning) return;
    this.panX = e.clientX - this.startX;
    this.panY = e.clientY - this.startY;
    this.applyTransform();
  }

  private onMouseUp(): void {
    if (this.isDraggingCard) {
      if (this.hasCardMoved) {
        this.justDraggedCard = true;
        setTimeout(() => { this.justDraggedCard = false; }, 80);
      }
      if (this.draggedCard) {
        this.draggedCard.classList.remove('is-dragging');
      }
      this.isDraggingCard = false;
      this.draggedCard = null;
      this.hasCardMoved = false;
    }

    if (this.isPanning) {
      this.isPanning = false;
      if (this.viewport) {
        this.viewport.classList.remove('is-panning');
      }
    }
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
      const header = target?.closest('.er-table-header') as HTMLElement | null;
      const card = target?.closest('.er-table-card') as HTMLElement | null;

      if (header && card) {
        this.isDraggingCard = true;
        this.draggedCard = card;
        this.cardDragStartX = touch.clientX;
        this.cardDragStartY = touch.clientY;
        this.cardInitialLeft = parseFloat(card.style.left) || 0;
        this.cardInitialTop = parseFloat(card.style.top) || 0;
        this.hasCardMoved = false;
        return;
      }

      if (target?.closest('.er-zoom-controls') || target?.closest('.er-table-card')) {
        return;
      }

      this.isPanning = true;
      this.startX = touch.clientX - this.panX;
      this.startY = touch.clientY - this.panY;
      if (this.viewport) {
        this.viewport.classList.add('is-panning');
      }
    } else if (e.touches.length === 2) {
      this.isPanning = false;
      this.isDraggingCard = false;
      if (this.draggedCard) {
        this.draggedCard.classList.remove('is-dragging');
        this.draggedCard = null;
      }
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      this.touchStartDistance = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      this.touchStartZoom = this.zoom;
      if (this.viewport) {
        const rect = this.viewport.getBoundingClientRect();
        this.touchCenterX = ((t0.clientX + t1.clientX) / 2) - rect.left;
        this.touchCenterY = ((t0.clientY + t1.clientY) / 2) - rect.top;
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (this.isDraggingCard && this.draggedCard) {
        e.preventDefault();
        const dist = Math.hypot(touch.clientX - this.cardDragStartX, touch.clientY - this.cardDragStartY);
        if (!this.hasCardMoved && dist > 5) {
          this.hasCardMoved = true;
          this.draggedCard.classList.add('is-dragging');
        }
        if (this.hasCardMoved) {
          const dx = (touch.clientX - this.cardDragStartX) / (this.zoom || 1);
          const dy = (touch.clientY - this.cardDragStartY) / (this.zoom || 1);
          this.draggedCard.style.left = `${Math.max(10, this.cardInitialLeft + dx)}px`;
          this.draggedCard.style.top = `${Math.max(10, this.cardInitialTop + dy)}px`;
          this.drawConnections();
        }
        return;
      }

      if (this.isPanning) {
        e.preventDefault();
        this.panX = touch.clientX - this.startX;
        this.panY = touch.clientY - this.startY;
        this.applyTransform();
      }
    } else if (e.touches.length === 2 && this.touchStartDistance > 0) {
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const currentDistance = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const factor = currentDistance / this.touchStartDistance;
      const newZoom = Math.min(2.5, Math.max(0.25, this.touchStartZoom * factor));

      this.panX = this.touchCenterX - ((this.touchCenterX - this.panX) / this.zoom) * newZoom;
      this.panY = this.touchCenterY - ((this.touchCenterY - this.panY) / this.zoom) * newZoom;
      this.zoom = newZoom;
      this.applyTransform();
    }
  }

  private onTouchEnd(): void {
    this.onMouseUp();
    this.touchStartDistance = 0;
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
      this.resizeSvg(canvasWidth, canvasHeight);
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

    this.resizeSvg(canvasWidth, canvasHeight);
  }

  private resizeSvg(width: number, height: number): void {
    if (!this.svgLayer) return;
    this.svgLayer.setAttribute('width', `${width}`);
    this.svgLayer.setAttribute('height', `${height}`);
    this.svgLayer.style.width = `${width}px`;
    this.svgLayer.style.height = `${height}px`;
  }

  public drawConnections(): void {
    if (!this.currentData || !this.svgGroup) return;

    // Clear previous SVG connections
    this.svgGroup.innerHTML = '';

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
      const relStrokeColor = '#0891b2'; // Cyan/Teal

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
              this.renderSvgConnection({
                sourceRow: relRow,
                targetRow: activePkRow,
                sourceTable: relKey,
                sourceField: f,
                targetTable: main_table,
                targetField: pkFieldName || 'id',
                pts,
                color: relStrokeColor,
                isChild: true
              });
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
            this.renderSvgConnection({
              sourceRow: fkRow,
              targetRow: targetPkRow,
              sourceTable: main_table,
              sourceField: fieldName,
              targetTable: targetKey,
              targetField: targetPkField,
              pts,
              color: strokeColor,
              isChild: false
            });
          }
        }
      }
    });
  }

  private renderSvgConnection(opt: {
    sourceRow: HTMLElement;
    targetRow: HTMLElement;
    sourceTable: string;
    sourceField: string;
    targetTable: string;
    targetField: string;
    pts: {
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      startIsRight: boolean;
      endIsRight: boolean;
    };
    color: string;
    isChild: boolean;
  }): void {
    if (!this.svgGroup) return;

    const { startX, startY, endX, endY, startIsRight, endIsRight } = opt.pts;
    const dirS = startIsRight ? 1 : -1;
    const dirE = endIsRight ? 1 : -1;

    // Many-side (Crow's Foot): sourceRow is the ForeignKey / Child table side
    const forkX = startX + 12 * dirS;
    const ringX = startX + 17 * dirS;
    const splineStartX = startX + 20 * dirS;

    // One-side (Double Bar --||--): targetRow is the PrimaryKey / Parent table side
    const bar1X = endX + 6 * dirE;
    const bar2X = endX + 11 * dirE;
    const splineEndX = endX + 11 * dirE;

    const curvature = Math.min(140, Math.max(35, Math.abs(splineEndX - splineStartX) * 0.4 + Math.abs(endY - startY) * 0.15));
    const cp1X = startIsRight ? splineStartX + curvature : splineStartX - curvature;
    const cp1Y = startY;
    const cp2X = endIsRight ? splineEndX + curvature : splineEndX - curvature;
    const cp2Y = endY;

    // Main Bézier spline between the two cardinality markers
    const pathData = `M ${splineStartX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${splineEndX} ${endY}`;
    // Full path for hover hit-testing
    const hitPathData = `M ${startX} ${startY} L ${splineStartX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${splineEndX} ${endY} L ${endX} ${endY}`;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'er-relation-group');
    g.dataset.source = `${opt.sourceTable}.${opt.sourceField}`;
    g.dataset.target = `${opt.targetTable}.${opt.targetField}`;

    // 1. Invisible wide hit path for effortless hover detection
    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', hitPathData);
    hitPath.setAttribute('class', 'er-spline-hit');
    g.appendChild(hitPath);

    // 2. Visible crisp vector spline
    const visiblePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    visiblePath.setAttribute('d', pathData);
    visiblePath.setAttribute('class', 'er-spline');
    visiblePath.setAttribute('stroke', opt.color);
    visiblePath.setAttribute('stroke-width', '1.8');
    g.appendChild(visiblePath);

    // 3. Many-Side: Authentic Martin Crow's Foot Fork (3 prongs)
    const crowsFootPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const crowsD = `M ${startX} ${startY - 7} L ${forkX} ${startY} L ${startX} ${startY + 7} M ${startX} ${startY} L ${splineStartX} ${startY}`;
    crowsFootPath.setAttribute('d', crowsD);
    crowsFootPath.setAttribute('class', 'er-crows-foot');
    crowsFootPath.setAttribute('stroke', opt.color);
    crowsFootPath.setAttribute('stroke-width', '1.8');
    g.appendChild(crowsFootPath);

    // 4. Many-Side: Optional / Zero Ring (indicating 0..N relationship)
    const crowsRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    crowsRing.setAttribute('cx', `${ringX}`);
    crowsRing.setAttribute('cy', `${startY}`);
    crowsRing.setAttribute('r', '3');
    crowsRing.setAttribute('class', 'er-crows-ring');
    crowsRing.setAttribute('stroke', opt.color);
    crowsRing.setAttribute('fill', 'var(--er-card-bg)');
    g.appendChild(crowsRing);

    // 5. One-Side: Double Crossbar (--||--) indicating Mandatory Exactly One (1..1)
    const oneBarPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const oneD = `M ${endX} ${endY} L ${splineEndX} ${endY} M ${bar1X} ${endY - 6} L ${bar1X} ${endY + 6} M ${bar2X} ${endY - 6} L ${bar2X} ${endY + 6}`;
    oneBarPath.setAttribute('d', oneD);
    oneBarPath.setAttribute('class', 'er-one-bar');
    oneBarPath.setAttribute('stroke', opt.color);
    oneBarPath.setAttribute('stroke-width', '1.8');
    g.appendChild(oneBarPath);

    // Tooltip title
    const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleEl.textContent = `${opt.sourceTable}.${opt.sourceField} → ${opt.targetTable}.${opt.targetField}`;
    g.appendChild(titleEl);

    // Interactive hover: glow line and highlight related fields in both table cards
    g.addEventListener('mouseenter', () => {
      opt.sourceRow.classList.add('is-relation-active');
      opt.targetRow.classList.add('is-relation-active');
    });

    g.addEventListener('mouseleave', () => {
      opt.sourceRow.classList.remove('is-relation-active');
      opt.targetRow.classList.remove('is-relation-active');
    });

    g.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      this.selectField(opt.sourceField);
    });

    this.svgGroup.appendChild(g);
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

  public generateStandaloneSvg(pureVector: boolean = false): string | null {
    if (!this.nodesLayer || !this.svgGroup) return null;
    const cards = Array.from(this.nodesLayer.querySelectorAll('.er-table-card')) as HTMLElement[];
    if (cards.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    cards.forEach(card => {
      const left = parseFloat(card.style.left) || 0;
      const top = parseFloat(card.style.top) || 0;
      const w = card.offsetWidth || 280;
      const h = card.offsetHeight || 260;
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (left + w > maxX) maxX = left + w;
      if (top + h > maxY) maxY = top + h;
    });

    const pad = 40;
    const totalW = Math.round(maxX - minX + pad * 2);
    const totalH = Math.round(maxY - minY + pad * 2);
    const offsetX = Math.round(-minX + pad);
    const offsetY = Math.round(-minY + pad);

    const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark' || document.body.classList.contains('dark-theme');
    const bg = isDark ? '#0f172a' : '#f8fafc';
    const cardBg = isDark ? '#1e293b' : '#ffffff';
    const cardBorder = isDark ? '#334155' : '#cbd5e1';
    const textColor = isDark ? '#f1f5f9' : '#1e293b';
    const textMuted = isDark ? '#94a3b8' : '#64748b';
    const rowBorder = isDark ? '#334155' : '#f1f5f9';

    const css = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .er-table-card { position: absolute; border-radius: 8px; border: 1px solid ${cardBorder}; background: ${cardBg}; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15); overflow: hidden; font-family: system-ui, -apple-system, sans-serif; color: ${textColor}; }
      .er-table-header { padding: 8px 12px; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${cardBorder}; }
      .er-table-card.active-table .er-table-header { background: #facc15; color: #1e293b; }
      .er-table-card.has-many-table .er-table-header { background: #0891b2; color: #ffffff; }
      .er-table-card.foreign-table .er-table-header { background: #ea580c; color: #ffffff; }
      .er-table-card.mutual-table .er-table-header { background: linear-gradient(135deg, #0891b2, #ea580c); color: #ffffff; }
      .er-table-badge { font-size: 0.65rem; padding: 2px 6px; border-radius: 12px; background: rgba(255,255,255,0.25); font-weight: 600; }
      .er-table-body { margin: 0; padding: 0; }
      .er-field-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px; border-bottom: 1px solid ${rowBorder}; font-size: 0.78rem; font-family: monospace; }
      .er-field-icon { width: 18px; margin-right: 6px; text-align: center; }
      .er-field-name { flex: 1; }
      .er-field-type { font-size: 0.72rem; color: ${textMuted}; font-family: system-ui, sans-serif; }
      .er-spline { fill: none; }
      .er-spline-hit { display: none; }
      .er-crows-foot { fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .er-crows-ring { fill: ${cardBg}; stroke-width: 1.6; }
      .er-one-bar { stroke-linecap: round; }
    `;

    const connectionsHtml = this.svgGroup.innerHTML;

    let cardsHtml = '';
    cards.forEach(card => {
      const cardX = (parseFloat(card.style.left) || 0) + offsetX;
      const cardY = (parseFloat(card.style.top) || 0) + offsetY;
      const cardW = card.offsetWidth || 280;
      const cardH = card.offsetHeight || 260;

      if (pureVector) {
        // Pure vector rendering: avoids foreignObject so canvas is never tainted on export
        const headerH = 34;
        const isSelected = card.classList.contains('active-table');
        const isForeign = card.classList.contains('foreign-table');

        let headerBg = '#0891b2';
        let headerTextColor = '#ffffff';
        if (isSelected) {
          headerBg = '#facc15';
          headerTextColor = '#1e293b';
        } else if (isForeign) {
          headerBg = '#ea580c';
          headerTextColor = '#ffffff';
        }

        const titleText = card.querySelector('.er-table-title')?.textContent?.trim() || '';
        const badgeEl = card.querySelector('.er-table-badge');
        const badgeStr = badgeEl?.textContent?.trim() || '';

        let rowsSvg = '';
        const rows = Array.from(card.querySelectorAll('.er-field-row')) as HTMLElement[];
        let rowY = headerH;
        const rowH = 24;

        rows.forEach(row => {
          const isRowSelected = row.classList.contains('selected');
          const isRowPk = row.classList.contains('pk-field');
          const isRowFk = row.classList.contains('fk-field');
          const name = row.querySelector('.er-field-name')?.textContent?.trim() || '';
          const type = row.querySelector('.er-field-type')?.textContent?.trim() || '';
          const icon = isRowPk ? 'PK' : (isRowFk ? 'FK' : '•');

          const rowBg = isRowSelected 
            ? (isDark ? 'rgba(56, 189, 248, 0.18)' : 'rgba(14, 165, 233, 0.12)')
            : 'transparent';

          rowsSvg += `
            <rect x="0" y="${rowY}" width="${cardW}" height="${rowH}" fill="${rowBg}"/>
            <line x1="0" y1="${rowY + rowH}" x2="${cardW}" y2="${rowY + rowH}" stroke="${rowBorder}" stroke-width="1"/>
            <text x="10" y="${rowY + 16}" font-size="10" font-family="monospace" font-weight="bold" fill="${isRowPk ? '#facc15' : textMuted}">${icon}</text>
            <text x="32" y="${rowY + 16}" font-size="11" font-family="monospace" font-weight="${isRowPk ? 'bold' : 'normal'}" fill="${textColor}">${name}</text>
            <text x="${cardW - 12}" y="${rowY + 16}" font-size="10" text-anchor="end" font-family="system-ui, sans-serif" fill="${textMuted}">${type}</text>
          `;
          rowY += rowH;
        });

        const actualCardH = Math.max(cardH, rowY);

        cardsHtml += `
          <g transform="translate(${cardX}, ${cardY})">
            <rect width="${cardW}" height="${actualCardH}" rx="8" ry="8" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1"/>
            <path d="M 0 8 Q 0 0 8 0 L ${cardW - 8} 0 Q ${cardW} 0 ${cardW} 8 L ${cardW} ${headerH} L 0 ${headerH} Z" fill="${headerBg}"/>
            <line x1="0" y1="${headerH}" x2="${cardW}" y2="${headerH}" stroke="${cardBorder}" stroke-width="1"/>
            <text x="12" y="22" font-size="12" font-weight="bold" font-family="system-ui, sans-serif" fill="${headerTextColor}">${titleText}</text>
            ${badgeStr ? `
              <rect x="${cardW - 100}" y="8" width="90" height="18" rx="9" ry="9" fill="rgba(255,255,255,0.25)"/>
              <text x="${cardW - 55}" y="20" font-size="9" text-anchor="middle" font-weight="600" font-family="system-ui, sans-serif" fill="${headerTextColor}">${badgeStr}</text>
            ` : ''}
            ${rowsSvg}
          </g>
        `;
      } else {
        const cleanCardHtml = card.outerHTML
          .replace(/style="[^"]*left:[^"]*"/g, `style="position:relative; width:${cardW}px; height:${cardH}px;"`);

        cardsHtml += `
          <foreignObject x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}">
            <div xmlns="http://www.w3.org/1999/xhtml">
              ${cleanCardHtml}
            </div>
          </foreignObject>
        `;
      }
    });

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
        <defs>
          <style type="text/css">
            ${css}
          </style>
        </defs>
        <rect width="100%" height="100%" fill="${bg}"/>
        <g transform="translate(${offsetX}, ${offsetY})">
          ${connectionsHtml}
        </g>
        ${cardsHtml}
      </svg>
    `.trim();
  }

  public exportSvg(): void {
    const svgContent = this.generateStandaloneSvg();
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    this.downloadBlob(blob, `sastry-er-${this.activeApp}-${this.activeModel}.svg`);
  }

  public exportPng(): void {
    const svgContent = this.generateStandaloneSvg(true);
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2; // High-resolution retina 2x
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        try {
          canvas.toBlob((pngBlob) => {
            if (pngBlob) {
              this.downloadBlob(pngBlob, `sastry-er-${this.activeApp}-${this.activeModel}.png`);
            } else {
              this.exportSvg();
            }
          }, 'image/png');
        } catch (e) {
          console.warn('Canvas export tainted, falling back to SVG:', e);
          this.exportSvg();
        }
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      // Fallback: download as SVG if browser canvas rasterization fails
      this.exportSvg();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
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

