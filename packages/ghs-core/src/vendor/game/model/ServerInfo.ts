// Vendored from Gloomhaven Secretariat @ 5a49c8e4a6db (AGPL-3.0). Do not edit; re-run pnpm --filter @fh/ghs-core vendor.
export class ServerInfo {
  url: string;
  port: number;
  secure: boolean;
  description: string = '';
  location: string = '';
  urls: Record<string, string> = {};

  constructor(url: string, port: number, secure: boolean = false) {
    this.url = url;
    this.port = port;
    this.secure = secure;
  }
}
