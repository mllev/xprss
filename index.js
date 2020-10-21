const url = require('url')
const querystring = require('querystring')
const fs = require('fs')
const path = require('path')

const mimeTypes = {
  'css'  : 'text/css',
  'html' : 'text/html',
  'js'   : 'application/javascript',
  'png'  : 'image/png',
  'jpg'  : 'image/jpeg',
  'svg'  : 'image/svg+xml',
  'ico'  : 'image/x-icon',
  'docx' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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

  res.redirect = (function (url) {
    this.writeHead(301, { 'Location': url })
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

function _handleError (req, res, next) {
  try {
    next()
  } catch (e) {
    console.log(req.method, req.url, e)
    res.status = 502
    res.end('server error')
  }
}

function _logger (req, res, next) {
  console.log(req.method, req.url)
  next()
}

function uid () {
  let id = ''
  const s = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const l = s.length

  for (let i = 0; i < 10; i++) {
    id += s[Math.floor(Math.random() * l)]
  }

  return id
}

function _static (dir, url) {
  return function (req, res) {
    const file = url || req.params.url || req.url
    const spl = file.split('.')
    const ext = spl[spl.length - 1]

    if (file.indexOf('..') !== -1) {
      return res.html(404, '<h3>Not found.</h3>')
    }

    fs.readFile(path.resolve(dir + file), function (err, data) {
      if (!err && data) {
        res.status = 200
        res.setHeader('Content-Type', mimeTypes[ext] || 'text/plain')
        res.end(data)
      } else {
        console.log(err)
        res.html(404, '<h3>Not found.</h3>')
      }
    })
  }
}

app.get = _handle('get')
app.post = _handle('post')
app.put = _handle('put')
app.delete = _handle('delete')
app.use = _handle('*', '*')

app.logger = _logger
app.error = _handleError
app.static = _static

module.exports = app
