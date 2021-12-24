import {
  Defaults,
  Meta,
  GetHeadRequest,
  BodyFirstRequest,
  HttpVerbs,
  FetchyResponse,
  Json,
} from './interface'
import { deepMerge } from './deep-merge'
import { validateDefaults, isHeadOrGet, appendToBaseUrl } from './helpers'

const bodyTransform = ['arrayBuffer', 'blob', 'formData', 'json', 'text'] as const

export class HTTPError extends Error {
  status: number

  constructor(message: string, code: number) {
    super(message)

    this.name = 'HTTPError'
    this.status = code
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'TimeoutError'
  }
}

function create({ baseUrl, interceptors, init }: Defaults) {
  return initialize({ baseUrl, interceptors, init })
}

function initialize(defaults: Defaults) {
  validateDefaults(defaults)

  const _fetch =
    defaults.interceptors == undefined ? fetch : interceptFetchRequest(fetch, defaults.interceptors)

  const meta: Meta = {
    _fetch,
    baseUrl: defaults.baseUrl || '',
    init: defaults.init,
    timeout: defaults.timeout,
  }

  return {
    get: instance(meta, 'GET'),
    post: instance(meta, 'POST'),
    put: instance(meta, 'PUT'),
    delete: instance(meta, 'DELETE'),
    patch: instance(meta, 'PATCH'),
    head: instance(meta, 'HEAD'),
  }
}

function instance(meta: Meta, verb: 'GET' | 'HEAD'): GetHeadRequest
function instance(meta: Meta, verb: 'POST' | 'PUT' | 'DELETE' | 'PATCH'): BodyFirstRequest
function instance(meta: Meta, verb: HttpVerbs) {
  if (isHeadOrGet(verb)) {
    return originalFetch.bind(null, meta, verb)
  }
  return jsonBodyFirstFetch.bind(null, meta, verb)
}

function throwOnFailHttpCode(response: Response): Response {
  if (!response.ok) {
    throw new HTTPError(response.statusText, response.status)
  }
  return response
}

function originalFetch(
  meta: Meta,
  verb: HttpVerbs,
  url: string,
  init?: RequestInit,
  timeout?: number
): FetchyResponse {
  const _url = appendToBaseUrl(meta.baseUrl, url)

  let _init = {
    method: verb,
    ...init,
  }

  const _timeout = timeout || meta.timeout

  if (meta.init) {
    _init = deepMerge(meta.init, _init)
  }
  return runFetch(meta._fetch, _url, _init, _timeout)
}

function jsonBodyFirstFetch(
  meta: Meta,
  verb: HttpVerbs,
  url: string,
  body?: Json | null,
  init?: RequestInit,
  timeout?: number
) {
  const _url = appendToBaseUrl(meta.baseUrl, url)

  let _init: RequestInit = {
    method: verb,
  }

  if (body) {
    _init['body'] = JSON.stringify(body)
  }

  if (init) {
    if (init.body && body != null) {
      console.warn(
        'Passing body inside the third argument object will override the second argument. Remember to JSON.stringify if it is meant to be JSON.'
      )
    }

    _init = Object.assign({}, _init, init)
  }

  if (meta.init) {
    _init = deepMerge(meta.init, _init)
  }

  const _timeout = timeout || meta.timeout

  return runFetch(meta._fetch, _url, _init, _timeout)
}

function attachBodyTransformsToResponse(_response: Promise<Response>): FetchyResponse {
  let response: Partial<FetchyResponse> = _response
  for (const methods of bodyTransform) {
    response[methods] = async () => (await _response).clone()[methods]()
  }
  return response as FetchyResponse
}

function interceptFetchRequest(
  _fetch: typeof fetch,
  interceptors: NonNullable<Defaults['interceptors']>
) {
  return (url: RequestInfo, init?: RequestInit) => {
    interceptors(url, init)
    const result = _fetch.call(null, url, init)
    return result
  }
}

function runFetch(_fetch: typeof fetch, url: string, init: RequestInit, timeout?: number) {
  const response = timeout
    ? fetchWithTimeout(_fetch, url, init, new AbortController(), timeout)
    : _fetch(url, init)

  return attachBodyTransformsToResponse(response.then(throwOnFailHttpCode))
}

const fetchWithTimeout = (
  _fetch: typeof fetch,
  url: string,
  init: RequestInit,
  abortController: AbortController,
  timeout: number
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const timeoutID = setTimeout(() => {
      abortController.abort()
      reject(new TimeoutError())
    }, timeout)

    _fetch(url, init)
      .then(resolve)
      .catch(reject)
      .then(() => {
        clearTimeout(timeoutID)
      })
  })

export { create as createFetchyConfiguration }
export default initialize({})
