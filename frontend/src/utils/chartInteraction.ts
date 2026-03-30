/**
 * 图表交互工具
 * 缩放、平移、联动、十字线、标注
 */

export interface ZoomState {
  start: number;  // 0-1
  end: number;    // 0-1
  minRange: number; // 最小可见范围比例
}

export interface PanState {
  isDragging: boolean;
  startX: number;
  startZoomStart: number;
  startZoomEnd: number;
}

export interface CrosshairPosition {
  x: number;
  y: number;
  dataIndex: number;
  visible: boolean;
}

export interface ChartAnnotation {
  id: string;
  type: 'horizontal' | 'vertical' | 'point' | 'range' | 'text';
  value: number | { x: number; y: number };
  endValue?: number;
  color: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  draggable?: boolean;
}

export interface LinkedChart {
  id: string;
  element: HTMLElement;
  syncZoom: boolean;
  syncCrosshair: boolean;
}

export interface InteractionConfig {
  enableZoom: boolean;
  enablePan: boolean;
  enableCrosshair: boolean;
  enableAnnotations: boolean;
  enableTooltip: boolean;
  zoomSensitivity: number;
  panSensitivity: number;
  minZoomRange: number;
  maxZoomRange: number;
}

const DEFAULT_CONFIG: InteractionConfig = {
  enableZoom: true,
  enablePan: true,
  enableCrosshair: true,
  enableAnnotations: true,
  enableTooltip: true,
  zoomSensitivity: 0.1,
  panSensitivity: 1,
  minZoomRange: 0.05,
  maxZoomRange: 1,
};

/**
 * 缩放管理器
 */
export class ZoomManager {
  private state: ZoomState;
  private config: InteractionConfig;
  private listeners: Set<(state: ZoomState) => void>;

  constructor(config?: Partial<InteractionConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = { start: 0, end: 1, minRange: this.config.minZoomRange };
    this.listeners = new Set();
  }

  getState(): ZoomState {
    return { ...this.state };
  }

  zoom(factor: number, center?: number): void {
    const { start, end, minRange } = this.state;
    const range = end - start;
    const centerPoint = center ?? (start + range / 2);
    const newRange = Math.max(minRange, Math.min(1, range * factor));
    const halfRange = newRange / 2;

    let newStart = Math.max(0, centerPoint - halfRange);
    let newEnd = Math.min(1, centerPoint + halfRange);

    if (newStart < 0) { newStart = 0; newEnd = newRange; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - newRange; }

    this.state = { start: newStart, end: newEnd, minRange };
    this.notify();
  }

  zoomIn(center?: number): void {
    this.zoom(1 - this.config.zoomSensitivity, center);
  }

  zoomOut(center?: number): void {
    this.zoom(1 + this.config.zoomSensitivity, center);
  }

  resetZoom(): void {
    this.state = { start: 0, end: 1, minRange: this.config.minZoomRange };
    this.notify();
  }

  setRange(start: number, end: number): void {
    const { minRange } = this.state;
    const range = end - start;
    if (range < minRange) return;
    this.state = {
      start: Math.max(0, start),
      end: Math.min(1, end),
      minRange,
    };
    this.notify();
  }

  pan(delta: number): void {
    const { start, end, minRange } = this.state;
    const range = end - start;
    let newStart = start + delta;
    let newEnd = end + delta;

    if (newStart < 0) { newStart = 0; newEnd = range; }
    if (newEnd > 1) { newEnd = 1; newStart = 1 - range; }

    this.state = { start: newStart, end: newEnd, minRange };
    this.notify();
  }

  subscribe(listener: (state: ZoomState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    this.listeners.forEach(l => l(this.getState()));
  }
}

/**
 * 十字线管理器
 */
export class CrosshairManager {
  private position: CrosshairPosition;
  private listeners: Set<(pos: CrosshairPosition) => void>;

  constructor() {
    this.position = { x: 0, y: 0, dataIndex: -1, visible: false };
    this.listeners = new Set();
  }

  getPosition(): CrosshairPosition {
    return { ...this.position };
  }

  update(x: number, y: number, dataIndex: number): void {
    this.position = { x, y, dataIndex, visible: true };
    this.notify();
  }

  hide(): void {
    this.position = { ...this.position, visible: false };
    this.notify();
  }

  subscribe(listener: (pos: CrosshairPosition) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    this.listeners.forEach(l => l(this.getPosition()));
  }
}

/**
 * 图表联动管理器
 */
export class ChartLinkManager {
  private charts: Map<string, LinkedChart> = new Map();
  private zoomManagers: Map<string, ZoomManager> = new Map();
  private crosshairManagers: Map<string, CrosshairManager> = new Map();
  private isSyncing: boolean = false;

  register(id: string, zoomManager: ZoomManager, crosshairManager: CrosshairManager, options?: Partial<LinkedChart>): void {
    this.zoomManagers.set(id, zoomManager);
    this.crosshairManagers.set(id, crosshairManager);

    // 订阅zoom变化并同步
    zoomManager.subscribe((state) => {
      if (this.isSyncing) return;
      this.isSyncing = true;
      this.zoomManagers.forEach((zm, key) => {
        if (key !== id) {
          zm.setRange(state.start, state.end);
        }
      });
      this.isSyncing = false;
    });

    // 订阅crosshair变化并同步
    crosshairManager.subscribe((pos) => {
      if (this.isSyncing) return;
      this.isSyncing = true;
      this.crosshairManagers.forEach((cm, key) => {
        if (key !== id && pos.visible) {
          cm.update(pos.x, pos.y, pos.dataIndex);
        } else if (!pos.visible) {
          cm.hide();
        }
      });
      this.isSyncing = false;
    });
  }

  unregister(id: string): void {
    this.zoomManagers.delete(id);
    this.crosshairManagers.delete(id);
  }

  syncZoomToAll(sourceId: string): void {
    const source = this.zoomManagers.get(sourceId);
    if (!source) return;
    const state = source.getState();
    this.isSyncing = true;
    this.zoomManagers.forEach((zm, key) => {
      if (key !== sourceId) zm.setRange(state.start, state.end);
    });
    this.isSyncing = false;
  }
}

/**
 * 注解管理器
 */
export class AnnotationManager {
  private annotations: Map<string, ChartAnnotation> = new Map();
  private listeners: Set<(annotations: ChartAnnotation[]) => void> = new Set();

  add(annotation: ChartAnnotation): void {
    this.annotations.set(annotation.id, annotation);
    this.notify();
  }

  remove(id: string): void {
    this.annotations.delete(id);
    this.notify();
  }

  update(id: string, updates: Partial<ChartAnnotation>): void {
    const existing = this.annotations.get(id);
    if (existing) {
      this.annotations.set(id, { ...existing, ...updates });
      this.notify();
    }
  }

  getAll(): ChartAnnotation[] {
    return Array.from(this.annotations.values());
  }

  clear(): void {
    this.annotations.clear();
    this.notify();
  }

  subscribe(listener: (annotations: ChartAnnotation[]) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    const list = this.getAll();
    this.listeners.forEach(l => l(list));
  }
}

/**
 * 鼠标滚轮缩放处理器
 */
export function createWheelZoomHandler(
  zoomManager: ZoomManager,
  sensitivity: number = 0.1
): (e: WheelEvent) => void {
  return (e: WheelEvent) => {
    e.preventDefault();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const center = (e.clientX - rect.left) / rect.width;

    if (e.deltaY < 0) {
      zoomManager.zoom(1 - sensitivity, center);
    } else {
      zoomManager.zoom(1 + sensitivity, center);
    }
  };
}

/**
 * 拖拽平移处理器
 */
export function createDragPanHandler(
  zoomManager: ZoomManager,
  sensitivity: number = 0.002
): {
  onMouseDown: (e: MouseEvent) => void;
  onMouseMove: (e: MouseEvent) => void;
  onMouseUp: () => void;
} {
  let isDragging = false;
  let startX = 0;
  let startState = { start: 0, end: 1 };

  return {
    onMouseDown: (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startState = zoomManager.getState();
    },
    onMouseMove: (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = (startX - e.clientX) * sensitivity;
      const range = startState.end - startState.start;
      zoomManager.setRange(
        startState.start + deltaX,
        startState.end + deltaX
      );
    },
    onMouseUp: () => {
      isDragging = false;
    },
  };
}

/**
 * 键盘快捷键处理器
 */
export function createKeyboardHandler(zoomManager: ZoomManager): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    switch (e.key) {
      case '+':
      case '=':
        e.preventDefault();
        zoomManager.zoomIn();
        break;
      case '-':
        e.preventDefault();
        zoomManager.zoomOut();
        break;
      case '0':
        e.preventDefault();
        zoomManager.resetZoom();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        zoomManager.pan(-0.05);
        break;
      case 'ArrowRight':
        e.preventDefault();
        zoomManager.pan(0.05);
        break;
    }
  };
}
