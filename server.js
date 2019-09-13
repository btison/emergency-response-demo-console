'use strict';

let compression = require('compression');
let express = require('express');
let logger = require('morgan');
let https = require('https');
let http = require('http');
let fs = require('fs');
let path = require('path');
let proxy = require('http-proxy-middleware');
let kafka = require('kafka-node');
let socketIO = require('socket.io');

let app = express();

// these ENV variables are only set for local development. Default to services on Openshift
app.set('port', process.env.PORT || 8080);
app.set('incident-service', process.env.INCIDENT || 'http://incident-service:8080');
app.set('alert-service', process.env.ALERT || 'http://alert-service:8080');
app.set('responder-service', process.env.RESPONDER || 'http://responder-service:8080');
app.set('mission-service', process.env.MISSION || 'http://mission-service:8080');
app.set('process-viewer', process.env.PROCESS_VIEWER || 'http://process-viewer:8080');
app.set('responder-simulator', process.env.RESPONDER_SIMULATOR || 'http://responder-simulator:8080');
app.set('kafka-host', process.env.KAFKA_HOST || 'kafka-cluster-kafka-bootstrap.naps-emergency-response.svc:9092');
app.set('kafka-message-topic', ['topic-mission-event', 'topic-responder-location-update', 'topic-incident-event', 'topic-responder-event', 'topic-incident-command', 'topic-responder-command']);
if (process.env.KAFKA_TOPIC) {
  app.set('kafka-message-topic', process.env.KAFKA_TOPIC.split(','));
}
app.set('kafka-groupid', process.env.KAFKA_GROUP_ID || 'emergency-console-group');
app.set('kafka-certs', process.env.KAFKA_CERTS);

app.use(compression());

app.use(logger('combined'));

app.use(express.static(path.join(__dirname, 'dist')));

// setup server
const certConfig = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
};

let server = app.get('port') !== 8080 ? https.createServer(certConfig, app) : http.createServer(app);

// setup socket
let io = socketIO(server);
io.on('connection', socket => {
  socket.emit('init', { message: 'Socket initialization' });
});
io.of('/shelters').on('connection', socket => {
  socket.emit('init', { message: 'Shelters init' });
});

// setup kafka connection
const sslOptions = {
    ca: fs.readFileSync(app.get('kafka-certs') + '/ca.crt'),
    key: fs.readFileSync(app.get('kafka-certs') + '/user.key'),
    cert: fs.readFileSync(app.get('kafka-certs') + '/user.crt'),
    requestCert: true
}

console.log('Setting up Kafka client for ', app.get('kafka-host'), 'on topic', app.get('kafka-message-topic'));
let kafkaConsumerGroup = new kafka.ConsumerGroup({
  kafkaHost: app.get('kafka-host'),
  groupId: app.get('kafka-groupid'),
  sslOptions: sslOptions
}, app.get('kafka-message-topic'));

kafkaConsumerGroup.on('message', msg => {
  try {
    const parsedMessage = JSON.parse(msg.value);
    io.sockets.emit(msg.topic, parsedMessage);
  } catch (e) {
    console.error('Failed to parse Kafka message', msg);
  }
});

kafkaConsumerGroup.on('error', err => {
  console.error('Failed to connect to Kafka', err);
  io.sockets.emit('error', { message: "Failed to connect to backing message queue's" });
});

kafkaConsumerGroup.on('offsetOutOfRange', (err) => {
  console.error('Failed to consume message (offsetOutOfRange)', err);
  io.sockets.emit('error', { message: "Failed to consume messages from backing message queue's" });
})

// mock shelter service proxy
app.get('/shelter-service/api/shelters', (_, res) => {
  res.json([{
    name: 'Port City Marina',
    lat: 34.2461,
    lon: -77.9519,
    rescued: 0
  }, {
    name: 'Wilmington Marine Center',
    lat: 34.1706,
    lon: -77.949,
    rescued: 0
  }, {
    name: 'Carolina Beach Yacht Club',
    lat: 34.0583,
    lon: -77.8885,
    rescued: 0
  }]);
});

// incident server proxy
app.use(
  '/incident-service/*',
  proxy({
    target: app.get('incident-service'),
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/incident-service': ''
    }
  })
);

// alert server proxy
app.use(
  '/alert-service/*',
  proxy({
    target: app.get('alert-service'),
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/alert-service': ''
    }
  })
);

// responder server proxy
app.use(
  '/responder-service/*',
  proxy({
    target: app.get('responder-service'),
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/responder-service': ''
    }
  })
);

// mission server proxy
app.use(
  '/mission-service/*',
  proxy({
    target: app.get('mission-service'),
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/mission-service': ''
    }
  })
);

// process viewer proxy
app.use(
  '/process-viewer/*',
  proxy({
    target: app.get('process-viewer'),
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/process-viewer': ''
    }
  })
);

// responder simulator proxy
app.use(
  '/responder-simulator/*',
  proxy({
    target: app.get('responder-simulator'),
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/responder-simulator': ''
    }
  })
);

// mapbox directions service
app.use(
  '/mapbox/*',
  proxy({
    target: 'https://api.mapbox.com',
    secure: false,
    changeOrigin: true,
    logLevel: 'debug',
    pathRewrite: {
      '^/mapbox': ''
    }
  })
);

app.use((req, res) => {
  // respond with index to process links
  if (req.accepts('html')) {
    res.sendFile(__dirname + '/dist/index.html');
    return;
  }

  // otherwise resource was not found
  res.status(404);
  if (req.accepts('json')) {
    res.send({ error: 'Not found' });
    return;
  }

  res.type('txt').send('Not found');
});

server.listen(app.get('port'), () => {
  console.log('Express server listening on port ' + app.get('port'));
});
