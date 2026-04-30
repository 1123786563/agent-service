export function UploadAgentForm() {
  return (
    <form method="post" action="/api/creator/agents" encType="multipart/form-data" className="form">
      <label>
        智能体 ZIP
        <input name="file" type="file" accept=".zip,application/zip" required />
      </label>
      <button className="button" type="submit">上传并发布</button>
    </form>
  );
}
