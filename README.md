## xprss

`npm install xprss`

```javascript
const http = require('http')
const app = require('xprss')()

app.get('/', function (req, res) {
  res.html('<p>Hello, ' + req.params.name + '</p>')
})

http.createServer(app).listen(5000)
```
