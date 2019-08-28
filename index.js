const url = require('url')
const qs = require('querystring')
const fs = require('fs')
const path = require('path')

module.exports = function () {
  const mimeTypes = {
    'css'  : 'text/css',
    'html' : 'text/html',
    'js'   : 'application/javascript'
  }

  function trimAndSplit (s) {
    if (s[0] === '/') s = s.slice(1)
    if (s[s.length - 1] === '/') s = s.slice(0, s.length - 1)

    return s.split('/')
  }

  function app (req, res) {
    const method = req.method.toLowerCase()
    const handlers = app.handlers
    let found = false
    let i = 0

    res.success = (function () {
      this.status = 200
      this.end()
    }).bind(res)

    res.notfound = (function () {
       this.status = 404
       this.end('not found: ' + req.url)
    }).bind(res)

    res.redirect = (function (url) {
      this.writeHead(302, { 'Location': url })
      this.end()
    }).bind(res)

    res.json = (function (status, obj) {
      if (!obj) {
        obj = status
        status = 200
      }

      this.status = status
      this.setHeader('Content-Type', 'application/json')
      this.end(JSON.stringify(obj))
    }).bind(res)

    res.html = (function (status, str) {
      if (!str) {
        str = status
        status = 200
      }

      this.status = status
      this.setHeader('Content-Type', 'text/html')
      this.end(str)
    }).bind(res)

    res.csv = (function (status, obj) {
      if (!obj) {
        obj = status
        status = 200
      }

      this.status = status

      this.setHeader('Content-disposition', 'attachment; filename=' + obj.filename)
      this.setHeader('Content-Type', 'text/csv')
      this.end(obj.data)
    }).bind(res)

    // query string
    if (req.url.indexOf('?') !== -1) {
      req.query = url.parse(req.url, true).query
      req.url = req.url.split('?')[0]
    }

    function next () {
      for (; i < handlers.length; i++) {
        if (
          handlers[i].method === '*' ||
          (app.matchRoute(req, handlers[i].route) && method === handlers[i].method)
        ) {
          handlers[i++].handler(req, res, next)
          break
        }
      }
    }

    next()
  }

  app.matchRoute = function (req, route) {
    let url = req.url
    let params = {}
    let i = 0

    if (route === '*') {
      return true
    }

    route = trimAndSplit(route)
    url   = trimAndSplit(url)

    if (route.length !== url.length) {
      let last = route[route.length - 1]

      if (last[last.length - 1] !== '*') {
        return false
      }
    }

    for (; i < route.length; i++) {
      let r = route[i]
      let u = url[0]

      if (r[0] === ':') {
        if (r[r.length - 1] === '*') {
          r = r.slice(1, r.length - 1)
          params[r] = url.join('/')
          break
        } else {
          params[r.slice(1)] = u
        }
      } else if (r !== u) {
        return false
      }

      url.shift()
    }

    req.params = params
    return true
  }

  app.handlers = []

  function _handle (method, defaultRoute) {
    return function () {
      const args = Array.from(arguments)
      let route 

      if (typeof args[0] === 'string') {
        route = args[0]
        args.shift()
      } else {
        route = '*'
      }

      args.forEach(fn => {
        app.handlers.push({
          method: method,
          route: defaultRoute || route,
          handler: fn
        })
      })

      return app
    }
  }

  app.get = _handle('get')
  app.post = _handle('post')
  app.put = _handle('put')
  app.delete = _handle('delete')
  app.use = _handle('*', '*')

  app.use(function (req, res, next) {
    if (req.method == 'POST') {
      let body = ''

      req.on('data', function (data) {
        body += data
        if (body.length > 1e6) req.connection.destroy()
      })

      req.on('end', function () {
        let data
        try { data = JSON.parse(body) }
        catch (e) {
          try { data = qs.parse(body) }
          catch (e) { data = {} }
        }
        req.body = data
        next()
      })
    } else {
      next()
    }
  })

  return app
}

