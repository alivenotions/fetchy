import fetch from 'node-fetch'
;(window as any).fetch = fetch

import fetchy, { createFetchyConfiguration } from '../src'
// ts-jest was complaining about the types and it
// was not getting resolved by declaring a module.
const createTestServer = require('create-test-server')

describe('fetchy hitting the server', () => {
  let server: any
  beforeAll(async () => {
    server = await setupServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should run the GET request', async (done) => {
    expect((await fetchy.get(server.url)).ok).toEqual(true)
    done()
  })

  it('should run the POST request', async (done) => {
    expect((await fetchy.post(server.url)).ok).toEqual(true)
    done()
  })

  it('should run the PUT request', async (done) => {
    expect((await fetchy.put(server.url)).ok).toEqual(true)
    done()
  })

  it('should run the PATCH request', async (done) => {
    expect((await fetchy.patch(server.url)).ok).toEqual(true)
    done()
  })

  it('should run the DELETE request', async (done) => {
    expect((await fetchy.delete(server.url)).ok).toEqual(true)
    done()
  })

  it('should run the HEAD request', async (done) => {
    expect((await fetchy.head(server.url)).ok).toEqual(true)
    done()
  })

  it('should create an instance with a base url', async (done) => {
    const api = createFetchyConfiguration({
      baseUrl: server.url,
    })

    expect((await api.get('/base')).ok).toEqual(true)
    done()
  })

  it('call the callback passed to the interceptor property before every request', async (done) => {
    const callback = jest.fn()
    const api = createFetchyConfiguration({
      baseUrl: server.url,
      interceptors: callback,
    })

    await api.get('/base')
    expect(callback).toHaveBeenCalled()
    expect(callback).toHaveBeenCalledWith(`${server.url}/base`, { method: 'GET' })
    await api.get('/')
    expect(callback).toHaveBeenCalledTimes(2)
    done()
  })

  it('should throw if an invalid baseUrl is passed', async (done) => {
    expect.assertions(1)
    try {
      createFetchyConfiguration({
        baseUrl: 2 as any,
      })
    } catch (e) {
      expect(e).toBeDefined()
    }
    done()
  })

  it('should throw if an invalid interceptor is passed', async (done) => {
    expect.assertions(1)
    try {
      createFetchyConfiguration({
        interceptors: 2 as any,
      })
    } catch (e) {
      expect(e).toBeDefined()
    }
    done()
  })

  it('should throw if init is not an object', async (done) => {
    expect.assertions(1)
    try {
      createFetchyConfiguration({
        init: 2 as any,
      })
    } catch (e) {
      expect(e).toBeDefined()
    }
    done()
  })

  it('should throw if slashes mismatch between baseUrl and the request url', async (done) => {
    expect.assertions(2)
    try {
      const api = createFetchyConfiguration({
        baseUrl: server.url + '/',
      })

      await api.get('/base')
    } catch (e) {
      expect(e).toBeDefined()
    }

    try {
      const api = createFetchyConfiguration({
        baseUrl: server.url,
      })

      await api.get('base')
    } catch (e) {
      expect(e).toBeDefined()
    }
    done()
  })

  it('should return the response body by calling transform helpers', async (done) => {
    const api = createFetchyConfiguration({
      baseUrl: server.url,
    })

    const resultJson = await api.post('/echo', { id: 1 }).json<{ id: number }>()
    const resultText = await api.post('/echo', undefined, { body: 'yo' }).text()

    expect(resultJson).toEqual({ id: 1 })
    expect(resultText).toEqual('yo')
    done()
  })

  it('should override the second json argument if body is there in init', async (done) => {
    const echoApi = `${server.url}/echo`
    const result = await fetchy.post(echoApi, { id: 1 }, { body: '1' }).text()

    expect(result).toEqual('1')
    done()
  })

  it('should timeout if the response takes longer than the timeout time', async (done) => {
    const url = `${server.url}/twoSeconds`

    expect.assertions(3)

    try {
      await fetchy.get(url, {}, 1000).text()
    } catch (e) {
      expect(e).toBeDefined()
      expect(e.name).toEqual('TimeoutError')
    }

    try {
      const res = await fetchy.get(url, {}, 3000).text()
      expect(res).toEqual('slow')
    } catch (e) {}
    done()
  })

  it('should respect the signal passed and the timeout controller for cancelling the request', async (done) => {
    const url = `${server.url}/twoSeconds`

    expect.assertions(2)
    const controller = new AbortController()

    setTimeout(() => {
      controller.abort()
    }, 500)
    try {
      await fetchy.get(url, { signal: controller.signal }, 1000).text()
    } catch (e) {
      expect(e).toBeDefined()
      expect(e.name).toEqual('AbortError')
    }
    done()
  })

  it('should throw an error on non 2xx status codes', async (done) => {
    const url = `${server.url}/error`

    expect.assertions(1)

    try {
      await fetchy.delete(url).text()
    } catch (e) {
      expect(e).toBeDefined()
    }
    done()
  })

  it('should get the error status code on non 2xx status codes', async (done) => {
    const url = `${server.url}/error`

    expect.assertions(3)

    try {
      await fetchy.delete(url).text()
    } catch (e) {
      expect(e).toBeDefined()
      expect(e.name).toBe('HTTPError')
      expect(e.status).toBe(500)
    }
    done()
  })

  it('should merge the configured init and the one passed with http methods', async (done) => {
    let sentHeader: any
    const api = createFetchyConfiguration({
      baseUrl: server.url,
      init: {
        headers: {
          'Content-type': 'application/json',
          'cache-control': 'no-cache',
        },
        credentials: 'same-origin',
      },
      interceptors: (_req, init) => {
        sentHeader = init
      },
    })

    await api.post(
      '/',
      { id: 1 },
      {
        headers: {
          'cache-control': 'no-store',
          authentication: 'secret',
        },
        credentials: 'include',
      }
    )

    const expectedOutput1 = {
      headers: {
        'Content-type': 'application/json',
        'cache-control': 'no-store',
        authentication: 'secret',
      },
      credentials: 'include',
      method: 'POST',
      body: JSON.stringify({ id: 1 }),
    }

    expect(sentHeader).toEqual(expectedOutput1)

    const expectedOutput2 = {
      headers: {
        'Content-type': 'application/json',
        'cache-control': 'max-age=60',
      },
      credentials: 'same-origin',
      method: 'GET',
    }

    await api.get('/', {
      headers: {
        'cache-control': 'max-age=60',
      },
    })

    expect(sentHeader).toEqual(expectedOutput2)
    done()
  })
})

async function setupServer() {
  const server = await createTestServer()
  server.get('/', (_req: any, res: any) => {
    res.end()
  })

  server.get('/base', (_req: any, res: any) => {
    res.end()
  })

  server.post('/', (_req: any, res: any) => {
    res.end()
  })

  server.post('/echo', (req: any, res: any) => {
    res.send(req.body)
    res.end()
  })

  server.get('/twoSeconds', (_req: any, res: any) => {
    setTimeout(() => {
      res.send('slow')
      res.end()
    }, 2000)
  })

  server.delete('/error', (_req: any, res: any) => {
    res.status(500)
    res.send('whoops')
    res.end()
  })

  server.put('/', (_req: any, res: any) => {
    res.end()
  })

  server.patch('/', (_req: any, res: any) => {
    res.end()
  })

  server.delete('/', (_req: any, res: any) => {
    res.end()
  })
  server.head('/', (_req: any, res: any) => {
    res.end()
  })

  return server
}
