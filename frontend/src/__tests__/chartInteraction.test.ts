import { describe, it, expect, beforeEach } from 'vitest';
import {
  ZoomManager,
  CrosshairManager,
  AnnotationManager,
  ChartLinkManager,
} from '../utils/chartInteraction';
import type { ChartAnnotation } from '../utils/chartInteraction';

describe('图表交互工具', () => {
  describe('ZoomManager', () => {
    let zoom: ZoomManager;

    beforeEach(() => {
      zoom = new ZoomManager();
    });

    it('初始状态应为全范围', () => {
      const state = zoom.getState();
      expect(state.start).toBe(0);
      expect(state.end).toBe(1);
    });

    it('zoomIn应缩小可见范围', () => {
      zoom.zoomIn();
      const state = zoom.getState();
      expect(state.start).toBeGreaterThanOrEqual(0);
      expect(state.end).toBeLessThanOrEqual(1);
      expect(state.end - state.start).toBeLessThan(1);
    });

    it('zoomOut应扩大可见范围', () => {
      zoom.zoomIn(); // 先缩小
      zoom.zoomIn();
      const before = zoom.getState();
      zoom.zoomOut();
      const after = zoom.getState();
      expect(after.end - after.start).toBeGreaterThan(before.end - before.start);
    });

    it('resetZoom应恢复全范围', () => {
      zoom.zoomIn();
      zoom.zoomIn();
      zoom.resetZoom();
      const state = zoom.getState();
      expect(state.start).toBe(0);
      expect(state.end).toBe(1);
    });

    it('pan应平移可见区域', () => {
      zoom.zoomIn();
      const before = zoom.getState();
      zoom.pan(0.1);
      const after = zoom.getState();
      expect(after.start).toBeGreaterThan(before.start);
    });

    it('setRange应设置可见范围', () => {
      zoom.setRange(0.2, 0.8);
      const state = zoom.getState();
      expect(state.start).toBeCloseTo(0.2, 2);
      expect(state.end).toBeCloseTo(0.8, 2);
    });

    it('setRange不应小于最小范围', () => {
      zoom.setRange(0, 0.01); // 极小范围
      const state = zoom.getState();
      expect(state.end - state.start).toBeGreaterThanOrEqual(state.minRange - 0.01);
    });

    it('应通知订阅者', () => {
      let notified = false;
      zoom.subscribe(() => { notified = true; });
      zoom.zoomIn();
      expect(notified).toBe(true);
    });

    it('取消订阅后不应通知', () => {
      let count = 0;
      const unsub = zoom.subscribe(() => { count++; });
      zoom.zoomIn();
      unsub();
      zoom.zoomIn();
      expect(count).toBe(1);
    });

    it('zoomIn以指定中心缩放', () => {
      zoom.zoomIn(0.25);
      const state = zoom.getState();
      expect(state.start).toBeCloseTo(0, 1);
    });
  });

  describe('CrosshairManager', () => {
    let crosshair: CrosshairManager;

    beforeEach(() => {
      crosshair = new CrosshairManager();
    });

    it('初始状态不可见', () => {
      expect(crosshair.getPosition().visible).toBe(false);
    });

    it('update应更新位置并设为可见', () => {
      crosshair.update(100, 200, 5);
      const pos = crosshair.getPosition();
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);
      expect(pos.dataIndex).toBe(5);
      expect(pos.visible).toBe(true);
    });

    it('hide应隐藏十字线', () => {
      crosshair.update(100, 200, 5);
      crosshair.hide();
      expect(crosshair.getPosition().visible).toBe(false);
    });

    it('应通知订阅者', () => {
      let received: any = null;
      crosshair.subscribe((pos) => { received = pos; });
      crosshair.update(50, 60, 3);
      expect(received.x).toBe(50);
    });
  });

  describe('AnnotationManager', () => {
    let annotations: AnnotationManager;

    beforeEach(() => {
      annotations = new AnnotationManager();
    });

    it('初始为空', () => {
      expect(annotations.getAll().length).toBe(0);
    });

    it('add应添加注解', () => {
      annotations.add({
        id: 'a1', type: 'horizontal', value: 100,
        color: '#ff0000', label: '支撑位',
      });
      expect(annotations.getAll().length).toBe(1);
    });

    it('remove应删除注解', () => {
      annotations.add({
        id: 'a1', type: 'horizontal', value: 100,
        color: '#ff0000',
      });
      annotations.remove('a1');
      expect(annotations.getAll().length).toBe(0);
    });

    it('update应更新注解', () => {
      annotations.add({
        id: 'a1', type: 'horizontal', value: 100,
        color: '#ff0000',
      });
      annotations.update('a1', { value: 200, label: '新标签' });
      const ann = annotations.getAll()[0];
      expect(ann.value).toBe(200);
      expect(ann.label).toBe('新标签');
    });

    it('clear应清除所有注解', () => {
      annotations.add({ id: 'a1', type: 'horizontal', value: 1, color: '#000' });
      annotations.add({ id: 'a2', type: 'vertical', value: 2, color: '#000' });
      annotations.clear();
      expect(annotations.getAll().length).toBe(0);
    });

    it('应通知订阅者', () => {
      let notified = false;
      annotations.subscribe(() => { notified = true; });
      annotations.add({ id: 'a1', type: 'horizontal', value: 1, color: '#000' });
      expect(notified).toBe(true);
    });
  });

  describe('ChartLinkManager', () => {
    it('应同步zoom状态', () => {
      const manager = new ChartLinkManager();
      const zoom1 = new ZoomManager();
      const crosshair1 = new CrosshairManager();
      const zoom2 = new ZoomManager();
      const crosshair2 = new CrosshairManager();

      manager.register('chart1', zoom1, crosshair1);
      manager.register('chart2', zoom2, crosshair2);

      zoom1.setRange(0.2, 0.6);

      // chart2的zoom应该被同步
      const state2 = zoom2.getState();
      expect(state2.start).toBeCloseTo(0.2, 1);
      expect(state2.end).toBeCloseTo(0.6, 1);
    });

    it('应同步crosshair', () => {
      const manager = new ChartLinkManager();
      const zoom1 = new ZoomManager();
      const crosshair1 = new CrosshairManager();
      const zoom2 = new ZoomManager();
      const crosshair2 = new CrosshairManager();

      manager.register('chart1', zoom1, crosshair1);
      manager.register('chart2', zoom2, crosshair2);

      crosshair1.update(100, 200, 5);

      const pos2 = crosshair2.getPosition();
      expect(pos2.visible).toBe(true);
      expect(pos2.dataIndex).toBe(5);
    });

    it('unregister应断开同步', () => {
      const manager = new ChartLinkManager();
      const zoom1 = new ZoomManager();
      const crosshair1 = new CrosshairManager();
      const zoom2 = new ZoomManager();
      const crosshair2 = new CrosshairManager();

      manager.register('chart1', zoom1, crosshair1);
      manager.register('chart2', zoom2, crosshair2);
      manager.unregister('chart2');

      zoom1.setRange(0.1, 0.5);
      const state2 = zoom2.getState();
      expect(state2.start).toBe(0); // 不应被同步
    });
  });

  describe('注解类型', () => {
    const annotationTypes: ChartAnnotation['type'][] = ['horizontal', 'vertical', 'point', 'range', 'text'];

    it.each(annotationTypes)('应支持 %s 类型注解', (type) => {
      const ann: ChartAnnotation = {
        id: 'test',
        type,
        value: type === 'range' ? { x: 0, y: 100 } : 100,
        color: '#1890ff',
        label: `${type}注解`,
      };
      expect(ann.type).toBe(type);
      expect(ann.color).toBeTruthy();
    });

    it('应支持不同线条样式', () => {
      const styles: ChartAnnotation['style'][] = ['solid', 'dashed', 'dotted'];
      styles.forEach(style => {
        const ann: ChartAnnotation = {
          id: `test-${style}`,
          type: 'horizontal',
          value: 100,
          color: '#1890ff',
          style,
        };
        expect(ann.style).toBe(style);
      });
    });
  });
});
