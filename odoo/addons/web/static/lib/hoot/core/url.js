/** @odoo-module */

import { onWillRender, reactive, useState } from "@odoo/owl";
import { isIterable } from "@web/../lib/hoot-dom/hoot_dom_utils";
import { debounce, ensureArray, isNil } from "../hoot_utils";
import { CONFIG_KEYS, CONFIG_SCHEMA, FILTER_KEYS, FILTER_SCHEMA } from "./config";

/**
 * @typedef {{
 *  debug?: boolean;
 *  ignore?: boolean;
 * }} CreateUrlFromIdOptions
 *
 * @typedef {typeof import("./config").DEFAULT_CONFIG} DEFAULT_CONFIG
 *
 * @typedef {typeof import("./config").DEFAULT_FILTERS} DEFAULT_FILTERS
 */

//-----------------------------------------------------------------------------
// Global
//-----------------------------------------------------------------------------

const {
    history,
    location,
    Object: { entries: $entries },
    Set,
    URIError,
    URL,
    URLSearchParams,
} = globalThis;

//-----------------------------------------------------------------------------
// Internal
//-----------------------------------------------------------------------------

const debouncedUpdateUrl = debounce(function updateUrl() {
    const url = createUrl({});
    url.search = "";
    for (const [key, value] of $entries(urlParams)) {
        if (isIterable(value)) {
            for (const val of value) {
                if (val) {
                    url.searchParams.append(key, val);
                }
            }
        } else if (value) {
            url.searchParams.set(key, String(value));
        }
    }
    const path = url.toString();
    history.replaceState({ path }, "", path);
}, 20);

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

/**
 * @param {Partial<DEFAULT_CONFIG & DEFAULT_FILTERS>} params
 */
export function createUrl(params) {
    const url = new URL(location.href);
    for (const key in params) {
        url.searchParams.delete(key);
        if (!CONFIG_KEYS.includes(key) && !FILTER_KEYS.includes(key)) {
            throw new URIError(`unknown URL param key: "${key}"`);
        }
        if (isIterable(params[key])) {
            for (const value of params[key]) {
                url.searchParams.append(key, value);
            }
        } else if (!isNil(params[key])) {
            url.searchParams.set(key, params[key]);
        }
    }
    return url;
}

/**
 * @param {Record<keyof DEFAULT_FILTERS, string | Iterable<string>>} specs
 * @param {CreateUrlFromIdOptions} [options]
 */
export function createUrlFromId(specs, options) {
    const nextParams = {};
    for (const key of FILTER_KEYS) {
        nextParams[key] = new Set(ensureArray((options?.ignore && urlParams[key]) || []));
    }
    for (const [type, id] of $entries(specs)) {
        const ids = ensureArray(id);
        switch (type) {
            case "id": {
                if (options?.ignore) {
                    for (const id of ids) {
                        const exludedId = EXCLUDE_PREFIX + id;
                        if (nextParams.id.has(exludedId) || urlParams.id?.includes(exludedId)) {
                            nextParams.id.delete(exludedId);
                        } else {
                            nextParams.id.add(exludedId);
                        }
                    }
                } else {
                    for (const id of ids) {
                        nextParams.id.add(id);
                    }
                }
                break;
            }
            case "tag": {
                if (options?.ignore) {
                    for (const id of ids) {
                        const exludedId = EXCLUDE_PREFIX + id;
                        if (urlParams.tag?.includes(exludedId)) {
                            nextParams.tag.delete(exludedId);
                        } else {
                            nextParams.tag.add(exludedId);
                        }
                    }
                } else {
                    for (const id of ids) {
                        nextParams.tag.add(id);
                    }
                }
                break;
            }
        }
    }

    for (const key in nextParams) {
        if (!nextParams[key].size) {
            nextParams[key] = null;
        }
    }

    nextParams.debugTest = options?.debug ? true : null;

    return createUrl(nextParams);
}

export function refresh() {
    history.go();
}

/**
 * @param {Partial<DEFAULT_CONFIG & DEFAULT_FILTERS>} params
 */
export function setParams(params) {
    for (const [key, value] of $entries(params)) {
        if (!CONFIG_KEYS.includes(key) && !FILTER_KEYS.includes(key)) {
            throw new URIError(`unknown URL param key: "${key}"`);
        }
        if (value) {
            urlParams[key] = isIterable(value) ? [...value] : value;
        } else {
            delete urlParams[key];
        }
    }

    debouncedUpdateUrl();
}

/**
 * @param {...(keyof DEFAULT_CONFIG | keyof DEFAULT_FILTERS | "*")} keys
 */
export function subscribeToURLParams(...keys) {
    const state = useState(urlParams);
    if (keys.length) {
        const observedKeys = keys.includes("*") ? [...CONFIG_KEYS, ...FILTER_KEYS] : keys;
        onWillRender(() => observedKeys.forEach((key) => state[key]));
    }
    return state;
}

export const EXCLUDE_PREFIX = "-";

/** @type {Partial<DEFAULT_CONFIG & DEFAULT_FILTERS>} */
export const urlParams = reactive({});

// Update URL params immediatly

const searchParams = new URLSearchParams(location.search);
const searchKeys = new Set(searchParams.keys());
for (const [configKey, { aliases, parse }] of $entries({
    ...CONFIG_SCHEMA,
    ...FILTER_SCHEMA,
})) {
    const configKeys = [configKey, ...(aliases || [])];
    /** @type {string[]} */
    const values = [];
    let hasKey = false;
    for (const key of configKeys) {
        if (searchKeys.has(key)) {
            hasKey = true;
            values.push(...searchParams.getAll(key).filter(Boolean));
        }
    }
    if (hasKey) {
        urlParams[configKey] = parse(values);
    } else {
        delete urlParams[configKey];
    }
}
