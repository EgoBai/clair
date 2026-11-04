/**
 * file-saver 的测试替身（仅 backend vitest 环境），理由同 ./xlsx.ts。
 */
export function saveAs(): never {
  throw new Error('file-saver 是前端浏览器依赖，backend 测试环境未安装；纯函数测试不应触发下载');
}
export default { saveAs };
