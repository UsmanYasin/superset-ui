/* global FormData, fetch */
/* eslint prefer-promise-reject-errors: 'off' */
import 'whatwg-fetch';
import 'url-search-params-polyfill';

const DEFAULT_HEADERS = {};

// This function fetches an API response and returns the corresponding json
function callApi({
  url,
  method = 'GET', // GET, POST, PUT, DELETE
  mode = 'same-origin', // no-cors, cors, same-origin
  cache = 'default', // default, no-cache, reload, force-cache, only-if-cached
  credentials = 'same-origin', // include, same-origin, omit
  headers: partialHeaders,
  body,
  postPayload,
  stringify = true,
  redirect = 'follow', // manual, follow, error
  timeoutId,
  signal, // used for aborting
}) {
  const headers = { ...DEFAULT_HEADERS, ...partialHeaders };
  let request = {
    body,
    cache,
    credentials,
    headers,
    method,
    mode,
    redirect,
    signal,
  };

  if (method === 'POST' && typeof postPayload === 'object') {
    // using FormData has the effect that Content-Type header is set to `multipart/form-data`,
    // not e.g., 'application/x-www-form-urlencoded'
    const formData = new FormData();
    Object.keys(postPayload).forEach(key => {
      const value = postPayload[key];
      if (typeof value !== 'undefined') {
        formData.append(key, stringify ? JSON.stringify(postPayload[key]) : postPayload[key]);
      }
    });

    request = {
      ...request,
      body: formData, // new URLSearchParams(formData),
    };
  }

  return fetch(url, request) // eslint-disable-line compat/compat
    .then(
      response => {
        if (timeoutId) clearTimeout(timeoutId);

        // first try to parse as json, and fall back to text (e.g., in the case of HTML stacktrace)
        // cannot fall back to .text() without cloning the response because body is single-use
        return response
          .clone()
          .json()
          .catch(() => /* jsonParseError */ response.text().then(textPayload => ({ textPayload })))
          .then(maybeJson => ({
            json: maybeJson.textPayload ? null : maybeJson,
            response,
            text: maybeJson.textPayload,
          }));
      },
      error => {
        // clear timeout and forward error
        if (timeoutId) clearTimeout(timeoutId);

        return Promise.reject(error);
      },
    )
    .then(({ response, json, text }) => {
      if (!response.ok) {
        return Promise.reject({
          error: response.error || (json && json.error) || text || 'An error occurred',
          status: response.status,
          statusText: response.statusText,
        });
      }

      return Promise.resolve(typeof text === 'undefined' ? { json, response } : { response, text });
    });
}

// Fetch does not support timeout natively, so we add a layer with it.
// We pass the timeoutId to callApi so that it can clear it
export default function callApiWithTimeout({ timeout, ...rest }) {
  let timeoutId;

  return Promise.race([
    new Promise((resolve, reject) => {
      if (typeof timeout === 'number') {
        timeoutId = setTimeout(
          () =>
            reject({
              error: 'Request timed out',
              statusText: 'timeout',
            }),
          timeout,
        );
      }
    }),
    callApi({ ...rest, timeoutId }),
  ]);
}