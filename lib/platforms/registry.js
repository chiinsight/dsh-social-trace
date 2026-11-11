import { platformModule as weibo } from './weibo/module.js';
import { platformModule as xueqiu } from './xueqiu/module.js';
import { platformModule as douyin } from './douyin/module.js';

// The shared scheduler, store and Agent depend on this contract, not on platform implementations.
export const platformModules = { weibo, xueqiu, douyin };
export const platformModule = id => platformModules[id] || {};
