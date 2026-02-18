const fs = require('fs')
const path = require('path')

const nextDir = path.join(__dirname, '..', '.next', 'dev')

// Create directories
const dirs = [
  path.join(nextDir, 'server', 'pages', '_app'),
  path.join(nextDir, 'static', 'development'),
  path.join(nextDir, 'server'),
]
dirs.forEach(d => fs.mkdirSync(d, { recursive: true }))

// Create missing manifest files
const manifests = {
  [path.join(nextDir, 'server', 'pages', '_app', 'build-manifest.json')]: JSON.stringify({
    pages: {}, devFiles: [], ampDevFiles: [], polyfillFiles: [],
    lowPriorityFiles: [], rootMainFiles: [], ampFirstPages: []
  }),
  [path.join(nextDir, 'server', 'pages-manifest.json')]: JSON.stringify({}),
  [path.join(nextDir, 'routes-manifest.json')]: JSON.stringify({
    version: 3, basePath: '', pages404: true, caseSensitive: false,
    headers: [], rewrites: [], redirects: [], staticRoutes: [],
    dynamicRoutes: [], dataRoutes: [], notFoundRoutes: []
  }),
  [path.join(nextDir, 'server', 'middleware-manifest.json')]: JSON.stringify({
    version: 3, sortedMiddleware: [], middleware: {}, functions: {}
  }),
  [path.join(nextDir, 'static', 'development', '_buildManifest.js')]: 'self.__BUILD_MANIFEST={};self.__BUILD_MANIFEST_CB&&self.__BUILD_MANIFEST_CB()',
}

Object.entries(manifests).forEach(([filePath, content]) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content)
    process.stdout.write('Created: ' + path.basename(filePath) + '\n')
  }
})

process.stdout.write('Done\n')
