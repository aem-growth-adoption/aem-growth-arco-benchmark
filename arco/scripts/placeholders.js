import { toCamelCase } from './aem.js';

/**
 * Retrieves placeholders from the /placeholders.json spreadsheet.
 * @param {string} [prefix] the prefix for the placeholders path
 * @returns {Promise<Record<string, string>>} the placeholders object
 */
async function fetchPlaceholders(prefix = 'default') {
  window.placeholders = window.placeholders || {};
  if (!window.placeholders[prefix]) {
    window.placeholders[prefix] = new Promise((resolve) => {
      fetch(`${prefix === 'default' ? '' : prefix}/placeholders.json`)
        .then((resp) => {
          if (resp.ok) {
            return resp.json();
          }
          return { data: [] };
        })
        .then((json) => {
          const placeholders = {};
          json.data
            ?.forEach((placeholder) => {
              placeholders[toCamelCase(placeholder.Key)] = placeholder.Text;
            });
          window.placeholders[prefix] = placeholders;
          resolve(window.placeholders[prefix]);
        })
        .catch(() => {
          window.placeholders[prefix] = {};
          resolve(window.placeholders[prefix]);
        });
    });
  }
  return window.placeholders[prefix];
}

// eslint-disable-next-line import/prefer-default-export
export { fetchPlaceholders };
