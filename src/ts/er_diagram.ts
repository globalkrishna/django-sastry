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

export class SastryERDiagram {
  private container: HTMLElement | null;
  private viewport: HTMLElement | null;
  private canvas: HTMLCanvasElement | null;
  private nodesLayer: HTMLElement | null;
  private sidebarLeft: HTMLElement | null;
  private inspectorBody: HTMLElement | null;
  private currentModelTitle: HTMLElement | null;
  private searchInput: HTMLInputElement | null;

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
    this.canvas = document.querySelector(options.canvasSelector || '#erCanvas');
    this.nodesLayer = document.querySelector(options.nodesSelector || '#erNodesLayer');
    this.sidebarLeft = document.querySelector(options.sidebarLeftSelector || '#erSidebarLeft');
    this.inspectorBody = document.querySelector(options.inspectorBodySelector || '#erInspectorBody');
    this.currentModelTitle = document.querySelector(options.currentModelTitleSelector || '#erCurrentModelTitle');
    this.searchInput = document.querySelector(options.searchInputSelector || '#erSearchInput');

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

            this.lastClickedFk = fieldName;
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

    // Redraw connections on viewport scroll or window resize
    window.addEventListener('resize', () => this.redraw());
    if (this.viewport) {
      this.viewport.addEventListener('scroll', () => this.drawConnections());
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

    // Build reverse relation table cards (has_many / Child Tables)
    const hasManyKeys = Object.keys(has_many || {});
    hasManyKeys.forEach(relKey => {
      const relData = has_many[relKey];
      const card = this.createTableCard(relKey, relData, 'has-many-table', 'Child Table');
      this.nodesLayer!.appendChild(card);
    });

    // Build outgoing foreign key table cards (foreign / Referenced Tables)
    const foreignKeys = Object.keys(foreign || {});
    foreignKeys.forEach(fkKey => {
      const fkData = foreign[fkKey];
      const card = this.createTableCard(fkKey, fkData, 'foreign-table', 'Referenced Table');
      this.nodesLayer!.appendChild(card);
    });

    // Layout cards: Selected Table on the RIGHT, related tables distributed in columns on the LEFT
    this.layoutNodes(hasManyKeys, main_table, foreignKeys);

    // Select primary key field or first field
    const pkField = lvt.FieldSeq.find(f => {
      const fieldMeta = lvt[f] as FieldMetadata | undefined;
      return fieldMeta?.ColumnType === 'PrimaryKey';
    }) || lvt.FieldSeq[0];

    if (pkField) {
      this.selectField(pkField);
    }

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
    const iconClass = cardTypeClass === 'active-table' ? 'bi-star-fill text-dark' : (cardTypeClass === 'has-many-table' ? 'bi-arrow-return-right' : 'bi-link-45deg');

    let headerHtml = `
      <div class="er-table-header" title="${badgeText}: ${tableKey}">
        <div class="d-flex align-items-center text-truncate">
          <i class="bi ${iconClass} me-2"></i>
          <span class="text-truncate">${shortName}</span>
          ${appName ? `<span class="opacity-75 ms-1 small" style="font-size:0.7rem">(${appName})</span>` : ''}
        </div>
        <span class="er-table-badge">${cardTypeClass === 'active-table' ? 'Selected' : (cardTypeClass === 'has-many-table' ? 'Child ↗' : 'Ref ↗')}</span>
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
      const isFk = colType === 'ForeignKey' && kind;
      const shortKind = isFk ? (kind.includes('.') ? kind.split('.')[1] : kind) : '';
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

  private layoutNodes(hasManyKeys: string[], mainTableKey: string, foreignKeys: string[]): void {
    if (!this.viewport || !this.nodesLayer) return;

    const cardSpacingX = 60;
    const cardSpacingY = 16;
    const colWidth = 260;

    const activeCard = document.getElementById(`er-card-${mainTableKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (!activeCard) return;

    const totalRelated = hasManyKeys.length + foreignKeys.length;

    // Determine how many columns to use for related tables to the left of the selected table
    const availableW = Math.max(this.viewport.clientWidth - colWidth - 100, 400);
    const maxColsByWidth = Math.max(1, Math.floor(availableW / (colWidth + cardSpacingX)));
    const numCols = totalRelated > 0 ? Math.min(maxColsByWidth, Math.max(1, Math.ceil(totalRelated / 3))) : 0;

    // Position Selected Active Table on the FAR RIGHT
    const selectedTableX = numCols > 0 ? (40 + numCols * (colWidth + cardSpacingX)) : 60;
    const selectedTableY = 40;
    activeCard.style.left = `${selectedTableX}px`;
    activeCard.style.top = `${selectedTableY}px`;

    if (numCols === 0) {
      const maxX = selectedTableX + colWidth + 80;
      const maxY = selectedTableY + activeCard.offsetHeight + 80;
      this.nodesLayer.style.width = `${Math.max(maxX, this.viewport.clientWidth)}px`;
      this.nodesLayer.style.height = `${Math.max(maxY, this.viewport.clientHeight)}px`;
      this.resizeCanvas(Math.max(maxX, this.viewport.clientWidth), Math.max(maxY, this.viewport.clientHeight));
      return;
    }

    // Initialize column Y heights (starting at 40px)
    const colHeights = new Array(numCols).fill(40);

    // Place related table cards using bin-packing (preferring columns closer to the right / selected table)
    const placeTables = (keys: string[]) => {
      keys.forEach(key => {
        const card = document.getElementById(`er-card-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
        if (!card) return;

        // Find column with minimum height (tie-break: choose higher column index, i.e. closer to selected table)
        let bestCol = numCols - 1;
        let minH = colHeights[numCols - 1];
        for (let c = numCols - 1; c >= 0; c--) {
          if (colHeights[c] < minH) {
            minH = colHeights[c];
            bestCol = c;
          }
        }

        const cardX = 40 + bestCol * (colWidth + cardSpacingX);
        const cardY = colHeights[bestCol];
        card.style.left = `${cardX}px`;
        card.style.top = `${cardY}px`;
        colHeights[bestCol] += card.offsetHeight + cardSpacingY;
      });
    };

    // Place Child Tables (has_many) first, then Foreign Tables
    placeTables(hasManyKeys);
    placeTables(foreignKeys);

    // Compute total canvas dimensions
    const maxColHeight = Math.max(...colHeights, selectedTableY + activeCard.offsetHeight);
    const maxX = selectedTableX + colWidth + 80;
    const maxY = maxColHeight + 80;

    this.nodesLayer.style.width = `${Math.max(maxX, this.viewport.clientWidth)}px`;
    this.nodesLayer.style.height = `${Math.max(maxY, this.viewport.clientHeight)}px`;

    this.resizeCanvas(Math.max(maxX, this.viewport.clientWidth), Math.max(maxY, this.viewport.clientHeight));
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
      const activePkRect = this.getRelativeRect(activePkRow);
      const targetAnchorX = activePkRect.left;
      const targetAnchorY = activePkRect.top + activePkRect.height / 2;

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0891b2'; // Cyan/Teal
      ctx.fillStyle = '#0891b2';

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
              const relRect = this.getRelativeRect(relRow);
              const startX = relRect.right;
              const startY = relRect.top + relRect.height / 2;

              // Draw smooth cubic curve
              ctx.beginPath();
              ctx.moveTo(startX, startY);
              const cp1X = startX + (targetAnchorX - startX) * 0.5;
              const cp1Y = startY;
              const cp2X = startX + (targetAnchorX - startX) * 0.5;
              const cp2Y = targetAnchorY;
              ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, targetAnchorX, targetAnchorY);
              ctx.stroke();

              // Draw Arrowhead at active PK left
              ctx.beginPath();
              ctx.moveTo(targetAnchorX, targetAnchorY);
              ctx.lineTo(targetAnchorX - 7, targetAnchorY - 4);
              ctx.lineTo(targetAnchorX - 7, targetAnchorY + 4);
              ctx.closePath();
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
            const fkRect = this.getRelativeRect(fkRow);
            const targetPkRect = this.getRelativeRect(targetPkRow);

            // Active table FK is on the right -> anchor at left edge of fkRow
            const startX = fkRect.left;
            const startY = fkRect.top + fkRect.height / 2;

            // Target table PK is on the left -> anchor at right edge of targetPkRow
            const endX = targetPkRect.right;
            const endY = targetPkRect.top + targetPkRect.height / 2;

            const strokeColor = this.fkColors[colorIdx % this.fkColors.length];
            colorIdx++;

            ctx.lineWidth = 1.8;
            ctx.strokeStyle = strokeColor;
            ctx.fillStyle = strokeColor;

            // Draw connecting bezier curve going leftwards from startX to endX
            const dist = Math.abs(startX - endX);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            const cp1X = startX - dist * 0.45;
            const cp1Y = startY;
            const cp2X = endX + dist * 0.45;
            const cp2Y = endY;
            ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
            ctx.stroke();

            // Draw small circle anchor at target PK (right edge)
            ctx.beginPath();
            ctx.arc(endX, endY, 4, 0, 2 * Math.PI);
            ctx.fill();

            // Draw small dot at start FK (left edge)
            ctx.beginPath();
            ctx.arc(startX, startY, 3, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    });
  }

  private getRelativeRect(element: HTMLElement): ElementRelativeRect {
    const elRect = element.getBoundingClientRect();
    const parentRect = this.nodesLayer!.getBoundingClientRect();
    return {
      left: elRect.left - parentRect.left,
      top: elRect.top - parentRect.top,
      right: elRect.right - parentRect.left,
      bottom: elRect.bottom - parentRect.top,
      width: elRect.width,
      height: elRect.height
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
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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

