// 测试TypeScript编译
// removed: console.log

// 简单的TypeScript代码
const message: string = 'Hello, TypeScript!';
const count: number = 42;

interface TestData {
  name: string;
  value: number;
}

const data: TestData = {
  name: '测试数据',
  value: 100
};

// removed: console.log

// 导出测试
export const testExport = '导出测试成功';