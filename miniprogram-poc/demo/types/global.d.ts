/// <reference types="@tarojs/taro" />

declare module '*.scss'
declare module '*.css'
declare module '*.png'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.gif'
declare module '*.svg'

/** Taro 全局配置定义函数（app.config.ts / page config 使用） */
declare function defineAppConfig(config: any): any
declare function definePageConfig(config: any): any

interface Window {}
