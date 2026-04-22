// Recharts type overrides for stricter v3 types
// Fixes Tooltip formatter type incompatibilities

import 'recharts';

declare module 'recharts' {
  interface TooltipProps<ValueType = any, NameType = any> {
    formatter?: (value: ValueType, name: NameType, entry: any, index: number, payload: any) => any;
    labelFormatter?: (label: any, payload: any) => any;
  }
}
