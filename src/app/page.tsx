import Link from "next/link";

const categories = [
  { label: "Research", icon: "R", status: "NEW" },
  { label: "Ops", icon: "O", status: "HOT" },
  { label: "Writing", icon: "W", status: "NEW" }
];

const filterChips = [
  { label: "Research", icon: "R", service: false },
  { label: "Ops", icon: "O", service: false },
  { label: "Writing", icon: "W", service: false },
  { label: "RAG", icon: "K", service: false },
  { label: "Deploy", icon: "D", service: false },
  { label: "Data", icon: "DA", service: false },
  { label: "Workflow", icon: "F", service: false },
  { label: "Service ready", icon: "S", service: true },
];

const featuredAgents = [
  {
    name: "Research Assistant",
    summary: "把散乱资料整理成带来源的研究简报，适合投研、法务和产品调研。",
    meta: "12 downloads · 4 skills",
    rating: "4.96",
    tone: "research"
  },
  {
    name: "Ops Console Copilot",
    summary: "读取运行手册并生成排障步骤，支持服务交接、事故复盘和工单整理。",
    meta: "8 downloads · 6 workflows",
    rating: "4.91",
    tone: "ops"
  },
  {
    name: "Proposal Writer",
    summary: "把客户背景、方案要点和交付范围合成可复用的中文提案初稿。",
    meta: "5 downloads · service ready",
    rating: "4.88",
    tone: "writing"
  }
];

const inspirationLinks = [
  { title: "Research 智能体", sub: "投研、法务、产品调研", letter: "R" },
  { title: "Ops 自动化", sub: "排障、工单、事故复盘", letter: "O" },
  { title: "Writing 助手", sub: "提案、文案、文档撰写", letter: "W" },
  { title: "RAG 知识库", sub: "文档检索、知识管理", letter: "K" },
  { title: "Data 分析", sub: "数据处理、可视化", letter: "D" },
  { title: "Workflow 编排", sub: "多步骤流程自动化", letter: "F" },
];

export default function HomePage() {
  return (
    <div className="airbnb-home">
      <section className="hero airbnb-hero">
        <div className="product-tabs" aria-label="Marketplace sections">
          {categories.map((category) => (
            <Link key={category.label} className="product-tab" href={`/agents?category=${category.label.toLowerCase()}`}>
              <span className="product-icon">{category.icon}</span>
              <span>{category.label}</span>
              <small>{category.status}</small>
            </Link>
          ))}
        </div>

        <div className="search-shell" aria-label="Agent package search">
          <Link className="search-segment strong" href="/agents">
            <span>Where</span>
            <b>智能体市场</b>
          </Link>
          <Link className="search-segment" href="/agents?category=research">
            <span>Category</span>
            <b>Research / Ops</b>
          </Link>
          <Link className="search-segment" href="/agents?sort=downloads">
            <span>Sort</span>
            <b>Top downloads</b>
          </Link>
          <Link className="search-orb" href="/agents" aria-label="Search agents">
            <span />
          </Link>
        </div>

        <nav className="category-strip-nav" aria-label="Quick category filters">
          {filterChips.map((chip) => (
            <Link
              key={chip.label}
              className={`category-chip${chip.label === "Research" ? " active" : ""}`}
              href={chip.service ? "/agents?service=1" : `/agents?category=${chip.label.toLowerCase()}`}
            >
              <span>{chip.icon}</span>
              {chip.label}
            </Link>
          ))}
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Hermes-agent marketplace</p>
            <h1>发现、检查并下载可导入 Hermes-agent 的智能体包</h1>
            <p className="lede">
              从通过结构校验的 ZIP 包开始，比较技能、工作流、下载量和可定制服务，再把合适的智能体导入你的 Hermes-agent 工作台。
            </p>
            <div className="actions">
              <Link className="button" href="/agents">浏览智能体</Link>
              <Link className="button secondary" href="/creator">上传智能体</Link>
            </div>
          </div>

          <aside className="rating-panel" aria-label="Marketplace trust score">
            <p className="rating-kicker">Marketplace validated</p>
            <div className="rating-row">
              <strong>4.93</strong>
              <span>validated package score</span>
            </div>
            <div className="rating-stars" aria-hidden="true">★★★★★</div>
            <p>
              metadata、README、技能声明和工作流入口会在发布前被检查，买家可以先看详情再下载。
            </p>
          </aside>
        </div>
      </section>

      <section className="home-section">
        <div className="section-header compact">
          <div>
            <p className="eyebrow">Live categories</p>
            <h2>热门智能体</h2>
          </div>
          <Link className="button secondary" href="/agents?service=1">仅看可提供服务</Link>
        </div>

        <div className="listing-grid">
          {featuredAgents.map((agent) => (
            <article className="listing-card" data-tone={agent.tone} key={agent.name}>
              <div className="listing-art">
                <span className="guest-badge">Verified package</span>
                <span className="heart-button" aria-hidden="true">♥</span>
                <span>{agent.name.slice(0, 1)}</span>
                <span className="carousel-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
              <div className="listing-body">
                <div>
                  <h3>{agent.name}</h3>
                  <p>{agent.summary}</p>
                </div>
                <div className="listing-meta">
                  <span>{agent.meta}</span>
                  <b>★ {agent.rating}</b>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="inspiration-section">
        <div className="section-header">
          <div>
            <h2>Inspiration for future agents</h2>
            <p className="muted">发现按场景分类的智能体灵感，快速定位适合你业务的方向。</p>
          </div>
        </div>
        <div className="city-link-grid">
          {inspirationLinks.map((link) => (
            <Link key={link.title} className="city-link-cell" href={`/agents?category=${link.title.split(" ")[0].toLowerCase()}`}>
              <div className="city-link-art">{link.letter}</div>
              <h3>{link.title}</h3>
              <p>{link.sub}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
