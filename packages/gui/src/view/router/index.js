import Index from '../pages/index'
import Proxy from '../pages/proxy'
import Server from '../pages/server'
import Setting from '../pages/setting'
import Help from '../pages/help'

const routes = [
  { path: '/', redirect: '/index' },
  { path: '/index', component: Index },
  { path: '/server', component: Server },
  { path: '/proxy', component: Proxy },
  { path: '/setting', component: Setting },
  { path: '/help', component: Help },
]

export default routes
