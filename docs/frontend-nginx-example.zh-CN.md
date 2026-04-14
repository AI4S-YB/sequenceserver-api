# 独立前端 Nginx 部署示例（中文）

本文给出一个适合当前前后端分离结构的 Nginx 部署示例。

适用前提：

- 前端已经执行过 `npm run build`
- 前端静态文件位于 `sequenceserver-web/dist`
- 后端 SequenceServer API 单独运行

## 1. 一个常见部署思路

可以采用下面这种拆分方式：

- `https://blast.example.org/`
  - 提供前端静态页面
- `https://blast.example.org/api/v1/*`
  - 反向代理到后端 Sinatra 服务

这种方式的优点是：

- 浏览器同域访问
- 可以减少跨域复杂度
- 部署体验更接近正式生产环境

## 2. 前端构建

先构建前端：

```bash
cd sequenceserver-web
npm run build
```

构建后目录：

```bash
sequenceserver-web/dist
```

## 3. Nginx 配置示例

下面是假设：

- 域名：`blast.example.org`
- 前端静态目录：`/srv/sequenceserver-web/dist`
- 后端 API 地址：`http://127.0.0.1:4567`

示例配置：

```nginx
server {
    listen 80;
    server_name blast.example.org;

    root /srv/sequenceserver-web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:4567;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 4. 这种方式下前端环境变量怎么配

如果前端和 API 使用同一域名，通常建议：

```bash
VITE_API_BASE_URL=
```

也就是留空并让前端走相对路径。

但当前项目的前端默认回退值是：

```bash
http://127.0.0.1:4567
```

因此在正式部署时，更稳妥的做法是明确写成正式地址，例如：

```bash
VITE_API_BASE_URL=https://blast.example.org
```

这样前端请求：

- `/api/v1/databases`

实际会访问：

- `https://blast.example.org/api/v1/databases`

## 5. 后端 `allowed_origins` 怎么配

如果前端和 API 真正同域，浏览器层面通常不会再有开发期那种跨域问题。

但为了兼容不同部署方式，后端仍建议保留明确配置。

例如：

```yaml
allowed_origins:
  - https://blast.example.org
```

如果你还要保留本地开发联调，也可以一起配置：

```yaml
allowed_origins:
  - https://blast.example.org
  - http://127.0.0.1:5173
  - http://localhost:5173
```

## 6. React Router 刷新 404 问题

当前新前端使用 React Router。

因此 Nginx 必须保证：

```nginx
try_files $uri $uri/ /index.html;
```

如果没有这一行，访问下面这些前端路由时直接刷新浏览器，会得到 404：

- `/databases`
- `/blast/new`
- `/jobs`
- `/jobs/blast/:id`
- `/jobs/database/:id`

## 7. API 反向代理注意事项

当前后端 API 会返回：

- JSON
- 任务状态
- 日志内容
- 结果内容

所以 Nginx 代理 `/api/v1/` 时要注意：

- 不要把 API 路径错误改写掉
- 不要把 JSON 返回强行当静态文件处理
- 日志和结果响应可能偏大，后续如有需要可调大缓冲区

## 8. HTTPS 建议

如果这个项目要公开使用，建议正式部署时直接启用 HTTPS。

至少原因包括：

- 浏览器访问更稳定
- 避免混合内容问题
- 更适合以后加入登录、鉴权或对象存储预签名地址

## 9. 推荐上线顺序

建议按下面顺序上线：

1. 先本地确认 `npm run build` 正常
2. 把 `dist/` 放到 Nginx 静态目录
3. 先只验证首页和静态路由
4. 再验证 `/api/v1/databases`
5. 再验证数据库导入、BLAST 提交、任务详情
6. 最后再开放本机路径 / URL / S3 白名单

## 10. 相关文档

- [docs/frontend-dev-and-deploy.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-dev-and-deploy.zh-CN.md)
- [docs/api-import-security.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/api-import-security.md)
