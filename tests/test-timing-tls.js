'use strict'

var server = require('./server')
var request = require('../index')
var tape = require('tape')
var https = require('https')

var tlsServer = server.createSSLServer()
var redirectMockTime = 10

tape('setup', function (t) {
  tlsServer.listen(55079, function () {
    tlsServer.on('/', function (req, res) {
      res.writeHead(200)
      res.end('https')
    })
    tlsServer.on('/redir', function (req, res) {
      // fake redirect delay to ensure strong signal for rollup check
      setTimeout(function () {
        res.writeHead(301, { 'location': 'https://localhost:' + tlsServer.port + '/' })
        res.end()
      }, redirectMockTime)
    })

    t.end()
  })
})

tape('non-redirected request is timed', function (t) {
  var options = {time: true, strictSSL: false}

  var start = new Date().getTime()
  var r = request('https://localhost:' + tlsServer.port + '/', options, function (err, res, body) {
    var end = new Date().getTime()

    t.equal(err, null)
    t.equal(typeof res.elapsedTime, 'number')
    t.equal(typeof res.responseStartTime, 'number')
    t.equal(typeof res.timingStart, 'number')
    t.equal((res.timingStart >= start), true)
    t.equal(typeof res.timings, 'object')
    t.equal((res.elapsedTime > 0), true)
    t.equal((res.elapsedTime <= (end - start)), true)
    t.equal((res.responseStartTime > r.startTime), true)
    t.equal((res.timings.socket >= 0), true)
    t.equal((res.timings.lookup >= res.timings.socket), true)
    t.equal((res.timings.connect >= res.timings.lookup), true)
    t.equal((res.timings.secureConnect >= res.timings.connect), true)
    t.equal((res.timings.response >= res.timings.secureConnect), true)
    t.equal((res.timings.end >= res.timings.response), true)
    t.equal(typeof res.timingPhases, 'object')
    t.equal((res.timingPhases.wait >= 0), true)
    t.equal((res.timingPhases.dns >= 0), true)
    t.equal((res.timingPhases.tcp >= 0), true)
    t.equal((res.timingPhases.ssl > 0), true)
    t.equal((res.timingPhases.firstByte > 0), true)
    t.equal((res.timingPhases.download > 0), true)
    t.equal((res.timingPhases.total > 0), true)
    t.equal((res.timingPhases.total <= (end - start)), true)

    // validate there are no unexpected properties
    var propNames = []
    for (var propName in res.timings) {
      if (res.timings.hasOwnProperty(propName)) {
        propNames.push(propName)
      }
    }
    t.deepEqual(propNames, ['socket', 'lookup', 'connect', 'secureConnect', 'response', 'end'])

    propNames = []
    for (propName in res.timingPhases) {
      if (res.timingPhases.hasOwnProperty(propName)) {
        propNames.push(propName)
      }
    }
    t.deepEqual(propNames, ['wait', 'dns', 'tcp', 'firstByte', 'download', 'total', 'ssl'])

    t.end()
  })
})

tape('keepAlive is timed', function (t) {
  var agent = new https.Agent({ keepAlive: true })
  var options = { time: true, agent: agent, strictSSL: false }
  var start1 = new Date().getTime()

  request('https://localhost:' + tlsServer.port + '/', options, function (err1, res1, body1) {
    var end1 = new Date().getTime()

    // ensure the first request's timestamps look ok
    t.equal((res1.timingStart >= start1), true)
    t.equal((start1 <= end1), true)

    t.equal((res1.timings.socket >= 0), true)
    t.equal((res1.timings.lookup >= res1.timings.socket), true)
    t.equal((res1.timings.connect >= res1.timings.lookup), true)
    t.equal((res1.timings.secureConnect >= res1.timings.connect), true)
    t.equal((res1.timings.response >= res1.timings.connect), true)

    // open a second request with the same agent so we re-use the same connection
    var start2 = new Date().getTime()
    request('https://localhost:' + tlsServer.port + '/', options, function (err2, res2, body2) {
      var end2 = new Date().getTime()

      // ensure the second request's timestamps look ok
      t.equal((res2.timingStart >= start2), true)
      t.equal((start2 <= end2), true)

      // ensure socket==lookup==connect for the second request
      t.equal((res2.timings.socket >= 0), true)
      t.equal((res2.timings.lookup === res2.timings.socket), true)
      t.equal((res2.timings.connect === res2.timings.lookup), true)
      t.equal((res2.timings.secureConnect === res2.timings.connect), true)
      t.equal((res2.timings.response >= res2.timings.connect), true)

      // explicitly shut down the agent
      if (typeof agent.destroy === 'function') {
        agent.destroy()
      } else {
        // node < 0.12
        Object.keys(agent.sockets).forEach(function (name) {
          agent.sockets[name].forEach(function (socket) {
            socket.end()
          })
        })
      }

      t.end()
    })
  })
})

tape('cleanup', function (t) {
  tlsServer.close(function () {
    t.end()
  })
})
