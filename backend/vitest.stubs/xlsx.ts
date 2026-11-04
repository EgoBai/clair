/**
 * xlsx 的测试替身（仅 backend vitest 环境）。
 *
 * 背景：backend 测试会跨包 import frontend/src/utils 下的纯函数模块，
 * 其中 bloombergExportEngine.ts 顶层 import 'xlsx' 与 'file-saver'。
 * CI 只安装 backend 依赖，Vite 会报 "Failed to load url xlsx"（run 41758036717）。
 * 本替身只保证模块可解析；任何真实调用立即抛错，避免测试静默产出假工作簿。
 */
function unavailable(): never {
  throw new Error('xlsx 是前端浏览器依赖，backend 测试环境未安装；纯函数测试不应调用它');
}

export const utils = {
  book_new: unavailable,
  aoa_to_sheet: unavailable,
  book_append_sheet: unavailable,
};
export const write = unavailable;
export const read = unavailable;
export default { utils, write, read };
