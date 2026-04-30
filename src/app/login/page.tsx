export default function LoginPage() {
  return (
    <section className="panel">
      <h1>登录</h1>
      <p className="lede">输入邮箱获取魔法链接。开发者上传权限由白名单控制。</p>
      <form method="post" action="/api/auth/request-link" className="form">
        <label>
          邮箱
          <input name="email" type="email" required />
        </label>
        <button className="button" type="submit">发送登录链接</button>
      </form>
    </section>
  );
}
