import http from "http";
import { app } from "./app";

const port = process.env.port || 3000;
const server = http.createServer(app);

// server.listen(port, () => {
//   console.log(`Server is started on port ${port}`);
// });

import * as os from "os";

let ip = "0.0.0.0";
const ips = os.networkInterfaces();

Object.keys(ips).forEach((_interface) => {
  const netInfo = ips[_interface];
  if (netInfo) {
    netInfo.forEach((_dev: os.NetworkInterfaceInfo) => {
      if (_dev.family === "IPv4" && !_dev.internal) {
        ip = _dev.address;
      }
    });
  }
});

server.listen(port, () => {
  console.log(`WebGame API listening at http://${ip}:${port}`);
});
