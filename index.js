const url = require('url')
const querystring = require('querystring')
const fs = require('fs')
const path = require('path')
const formidable = require('formidable')
const mimedb = require('./mime.json')

const mimeTypes = {};

Object.keys(mimedb).forEach((type) => {
  if (mimedb[type].extensions) {
    mimedb[type].extensions.forEach((ext) => {
      mimeTypes[ext] = type;
    });
  }
});

function trimAndSplit (s) {
  if (s[0] === '/') s = s.slice(1)
  if (s[s.length - 1] === '/') s = s.slice(0, s.length - 1)
  return s.split('/')
}

function app (req, res) {
  const method = req.method.toLowerCase()
  const handlers = app.handlers

  if (method === 'get' && app.publicDir) {
    const p = url.parse(req.url).pathname;
    const f = path.resolve(process.cwd(), app.publicDir, p.slice(1));
    const ext = path.extname(f);
    if (ext && serveStaticFile(f, res)) return;
  }

  let found = false
  let i = 0

  res.redirect = function (url) {
    res.writeHead(301, { 'Location': url })
    res.end()
  }

  res.json = function (status, obj) {
    if (!obj) {
      obj = status
      status = 200
    }

    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  }

  function next () {
    for (; i < handlers.length; i++) {
      if (
        handlers[i].method === '*' ||
        (app.matchRoute(req, handlers[i].route) && method === handlers[i].method)
      ) {
	found = true
        handlers[i++].handler(req, res, next)
        break
      }
    }
    if (i === handlers.length && !found) {
      res.statusCode = 404
      res.writeHead(404, { 'Content-type': 'text/plain' })
      res.end('not found')
    }
  }

  if (req.url.indexOf('?') !== -1) {
    req.query = url.parse(req.url, true).query
    req.url = req.url.split('?')[0]
  }

  parseBody(req, function () {
    next()
  })
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

function parseBody (req, cb) {
  let body = {}
  let files = []
  let form = new formidable.IncomingForm()
  
  form.onPart = part => {
    let buf = []

    if (!part.filename) {
      return form.handlePart(part)
    }

    let name = part.filename
    let mime = part.mime

    part.on('data', data => {
      buf.push(data)
    })
    
    part.on('end', () => {
      buf = Buffer.concat(buf)
      files.push({
        name: name,
        mime: mime,
        data: buf
      })
    })
  }

  form.on('field', (key, value) => {
    body[key] = value
  })

  form.on('end', () => {
    req.body = body
    req.files = files
    cb()
  })

  form.parse(req)
}

function serveStaticFile (p, res) {
  let ext = path.extname(p);
  if (!ext)
    return false;
  ext = ext.slice(1);
  try {
    const data = fs.readFileSync(p);
    const mime = mimeTypes[ext] || 'text/plain';
    res.writeHead(200, { 'Content-type': `${mime}` });
    res.end(data);
    return true;
  } catch (e) {
    console.log('XPRSS error', e)
    return false;
  }
}

function _static (dir) {
  return function (req, res) {
    const file = req.url
    const parts = file.split('.')
    const ext = parts[parts.length - 1]
    const fullpath = path

    fs.readFile(path.join(dir, + file), function (err, data) {
      if (!err && data) {
        res.statusCode = 200
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

module.exports = function (config) {
  if (config.publicDir) {
    app.publicDir = config.publicDir
  }
  return app
}

