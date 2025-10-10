/*
 * Copyright (c) 2015-2025 David Fahlander
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * This code is derived from Dexie.js (https://github.com/dexie/Dexie.js)
 * Original source: https://github.com/dexie/Dexie.js/blob/a572b5748e77108b9a4ee010cc19a77e20415bf3/src/functions/utils.ts#L134
 */

const hasOwn = Object.prototype.hasOwnProperty;

// biome-ignore lint/suspicious/noExplicitAny: Necessary here
type ObjectWithKeyPath = Record<string, any>;
// biome-ignore lint/suspicious/noExplicitAny: Necessary here
type KeyValue = any;

export function setByKeyPath(obj: ObjectWithKeyPath, keyPath: string | string[], value: KeyValue) {
	if (!obj || keyPath === undefined) return;
	if (Object.isFrozen(obj)) return;
	if (typeof keyPath !== 'string' && 'length' in keyPath) {
		for (let i = 0, l = keyPath.length; i < l; ++i) {
			const key = keyPath[i] as string;
			setByKeyPath(obj, key, value[i]);
		}
	} else {
		const period = keyPath.indexOf('.');
		if (period !== -1) {
			const currentKeyPath = keyPath.substr(0, period);
			const remainingKeyPath = keyPath.substr(period + 1);
			if (remainingKeyPath === '')
				if (value === undefined) {
					const num = Number.parseInt(currentKeyPath);
					if (Array.isArray(obj) && !Number.isNaN(num)) {
						obj.splice(num, 1);
					} else {
						delete obj[currentKeyPath];
					}
				} else obj[currentKeyPath] = value;
			else {
				let innerObj = obj[currentKeyPath];
				if (!innerObj || !hasOwn.call(obj, currentKeyPath)) innerObj = obj[currentKeyPath] = {};
				setByKeyPath(innerObj, remainingKeyPath, value);
			}
		} else {
			if (value === undefined) {
				const num = Number.parseInt(keyPath);
				if (Array.isArray(obj) && !Number.isNaN(num)) obj.splice(num, 1);
				else delete obj[keyPath];
			} else obj[keyPath] = value;
		}
	}
}

export function delByKeyPath(obj: ObjectWithKeyPath, keyPath: string | string[]) {
	if (typeof keyPath === 'string') setByKeyPath(obj, keyPath, undefined);
	else if ('length' in keyPath)
		[].map.call(keyPath, (kp) => {
			setByKeyPath(obj, kp, undefined);
		});
}
