(function () {
  const NAME = 'dsh-social-trace';
  const BASE = '/' + NAME;
  const CSS = `
    .st{--bg:var(--dsw-alias-bg-layer-1,#fff);--card:var(--dsw-alias-bg-layer-1,#fff);--inset:var(--dsw-alias-bg-layer-2,#fafafa);--text:var(--dsw-alias-label-primary,#17191d);--muted:var(--dsw-alias-label-secondary,#767b85);--line:var(--dsw-alias-border-l2,#e4e4e7);--accent:#7b5cff;--up:#f0444b;--green:#27895c;--amber:#956719;height:100%;min-height:0;min-width:0;width:100%;display:flex;overflow:hidden;background:var(--bg);color:var(--text);font:14px/1.6 system-ui,-apple-system,"PingFang SC",sans-serif;container-type:inline-size;container-name:st-app;position:relative}
    .st *{box-sizing:border-box}.st button,.st input,.st select{font:inherit;color:inherit}.st button,.st a{touch-action:manipulation}.st button{cursor:pointer;border:1px solid var(--line);background:var(--card);border-radius:8px;padding:7px 12px;transition:background .16s,border-color .16s,box-shadow .16s}.st button:hover{border-color:#b5a3ff;background:color-mix(in srgb,var(--accent) 3%,var(--card))}.st button:disabled{cursor:wait;opacity:.5}.st a{color:var(--accent);text-decoration:none}.st button:focus-visible,.st input:focus-visible,.st select:focus-visible,.st a:focus-visible,.st summary:focus-visible{outline:2px solid #b6a5ff;outline-offset:3px}
    .st input,.st select{min-width:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:9px 12px}.st input::placeholder{color:var(--muted)}.st h1{font-size:24px;letter-spacing:-.5px;margin:0 0 4px;font-weight:600}.st h3{font-size:15px;margin:0;font-weight:600}.st p{margin:8px 0}.st small{font-size:11px}.st-muted,.st-caption{color:var(--muted)}.st-caption{font-size:12px}.st-primary{background:var(--accent)!important;border-color:var(--accent)!important;color:#fff!important;font-weight:550}
    .st-aside{flex:0 0 165px;min-width:0;background:var(--bg);border-right:1px solid var(--line);padding:48px 14px 25px;display:flex;flex-direction:column;gap:24px;overflow:auto}.st-brand{font-size:21px;font-weight:650;letter-spacing:-.6px}.st-brand small{font-size:11px;letter-spacing:2px;display:block;color:var(--muted);font-weight:500;margin-bottom:7px}.st-aside h2{font-size:11px;letter-spacing:1px;color:var(--muted);margin:0 0 12px}.st-nav{display:grid;gap:6px}.st-nav button{text-align:left;border-color:transparent;background:transparent;padding:9px 10px}.st-nav button:hover:not(.active){border-color:transparent;background:var(--inset)}.st-nav .active{color:var(--accent);border-color:#d8ceff;background:color-mix(in srgb,var(--accent) 7%,var(--card))}.st-target{width:100%;text-align:left;margin:0 0 7px;font-size:12px!important;overflow:hidden;text-overflow:ellipsis}.st-account{margin-top:auto;padding-top:18px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}.st-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--amber);margin-right:7px}.st-dot.ready{background:var(--green)}
    .st-main{flex:1;min-width:0;min-height:0;overflow:auto;padding:24px;container-type:inline-size;container-name:st-main}.st-main>*{flex-shrink:0}.st-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}.st-head .st-muted{font-size:12px}.st-head-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.st .st-settings-button{white-space:nowrap;font-size:12px}.st-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.st-flow-status{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted)}.st-flow-status.partial{color:var(--amber)}.st-flow-status.partial i{background:var(--amber)}.st-flow-status i{width:5px;height:5px;border-radius:50%;background:var(--green)}.st-preview .st-flow-status i{background:#a896e7}
    .st-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:20px 0 24px}.st-stat{border:1px solid var(--line);border-radius:13px;padding:17px 20px;background:var(--card)}.st-stat strong{display:block;font-size:29px;font-weight:650;letter-spacing:-.8px;color:var(--up)}.st-stat span{color:var(--muted);font-size:12px}
    .st-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px}.st-toolbar input{flex:1;min-width:180px}.st-card{border:1px solid var(--line);border-radius:13px;padding:21px 23px;background:var(--card);margin-bottom:14px}.st-card-head{display:flex;gap:14px;justify-content:space-between;align-items:center;margin-bottom:14px}.st-badge{font-size:11px;border:1px solid var(--line);border-radius:20px;padding:3px 10px;color:var(--muted);white-space:nowrap}.st-badge.warn{color:var(--amber)}.st-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0 16px;line-height:1.85}.st-quote{border-left:2px solid #c4b5fd;background:var(--inset);padding:10px 15px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--muted)}
    .st-empty{padding:55px 24px;text-align:center;border:1px dashed var(--line);border-radius:13px;color:var(--muted)}.st-empty h3{color:var(--text);font-size:18px;margin-bottom:8px}.st-error{border:1px solid #e8d7b8;background:color-mix(in srgb,#d9a52b 7%,var(--card));color:var(--amber);padding:12px 16px;border-radius:9px;margin-bottom:18px;overflow-wrap:anywhere}.st-saved{border:1px solid #c6e3d1;background:color-mix(in srgb,var(--green) 5%,var(--card));color:var(--green);padding:12px 16px;border-radius:9px;margin-bottom:18px}.st-progress{display:flex;gap:24px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px;margin-top:16px;color:var(--muted);font-size:12px}.st-progress b{color:var(--text);font-size:17px;margin-right:5px}.st-form{display:grid;gap:14px;max-width:620px}.st-form label{display:grid;gap:6px}.st-form input{width:100%}.st-connect{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.st-notice{border-left:3px solid var(--line)}.st-notice.unread{border-left-color:var(--accent)}.st-footer{margin-top:24px;font-size:11px;color:var(--muted)}.st-path{overflow-wrap:anywhere}.st-workspace{margin-bottom:24px}
    .st-modebar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:8px 0 18px}.st-mode-label{font-size:11px;letter-spacing:.4px;color:var(--muted)}.st-modebar button{font-size:12px}.st-flow-top{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center;padding:0 1px 18px;color:var(--muted);font-size:11px}.st-flow-top strong{font-size:13px;color:var(--text);margin-right:12px;font-weight:550}.st-flow-top .totals{display:flex;gap:18px;flex-wrap:wrap}.st-flow-top b{font-size:22px;line-height:1.2;color:var(--up);margin-right:4px;font-weight:650;font-variant-numeric:tabular-nums}
    .st-flow-scroll{position:relative;border:1px solid var(--line);border-radius:14px;background:var(--bg)}.st-flow-stage{position:relative;display:grid;grid-template-columns:minmax(140px,1fr) clamp(112px,12cqw,156px) minmax(170px,.95fr) minmax(220px,1.3fr);gap:clamp(16px,2cqw,36px);padding:24px 20px;min-width:0;min-height:590px}.st-flow-col{position:relative;z-index:2;display:flex;flex-direction:column;gap:12px;min-width:0}.st-flow-label{color:var(--muted);font-size:11px;display:flex;align-items:center;gap:8px;margin-bottom:12px}.st-flow-label span{font:11px ui-monospace,monospace;color:#a9a5b7}.st-flow-stack{display:flex;flex-direction:column;justify-content:center;gap:14px;flex:1;min-width:0}.st-source-group{min-width:0}.st-source-group>summary{display:flex;gap:5px;align-items:center;flex-wrap:wrap;color:var(--muted);font-size:11px;padding:6px 1px;list-style:none;cursor:pointer}.st-source-group>summary>b{margin-left:auto;font-weight:500;font-variant-numeric:tabular-nums}.st-source-list{display:grid;gap:7px;padding-top:5px}.st-source-group+.st-source-group{margin-top:4px}
    .st .st-flow-node{position:relative;border:1px solid var(--line);background:var(--card);border-radius:11px;padding:14px;text-align:left;min-width:0;color:var(--text);transition:opacity .2s,border-color .2s,box-shadow .2s}.st button.st-flow-node{width:100%;white-space:normal}.st .st-flow-node:hover{border-color:#c3b4ff}.st .st-flow-node.selected{border-color:#b7a2ff;box-shadow:0 8px 22px #00000017}.st-flow-node.muted{opacity:.38}.st-flow-node header{display:flex;gap:7px;align-items:center;min-width:0;margin:0;flex:1}.st-flow-node header>div{min-width:0;flex:1}.st-flow-node strong{font-weight:550;font-size:13px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.st-flow-node small{display:block;font-size:11px;color:var(--muted)}.st-source-list .st-flow-node{display:flex;align-items:center;gap:7px;padding:9px;min-height:44px;background:linear-gradient(135deg,color-mix(in srgb,var(--node-color) 4%,var(--card)),var(--card) 75%)}.st-source-list .st-flow-node strong{font-size:12px}.st-source-count{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;flex:none}.st-flow-avatar{display:grid;place-items:center;flex:none;width:25px;height:25px;border-radius:7px;background:color-mix(in srgb,var(--node-color) 15%,var(--card));color:color-mix(in srgb,var(--node-color) 85%,var(--text));font-size:11px;font-weight:550}.st-node-icon{display:grid;place-items:center;width:30px;height:30px;color:var(--accent);background:color-mix(in srgb,var(--accent) 7%,var(--card));border-radius:8px;flex:none}
    .st-flow-node:before,.st-flow-node:after{content:'';position:absolute;width:6px;height:6px;border:1px solid #c9c5d2;background:var(--card);border-radius:50%;top:calc(50% - 4px)}.st-flow-node:before{left:-5px}.st-flow-node:after{right:-5px}.st-flow-col:first-of-type .st-flow-node:before,.st-flow-col:last-child .st-flow-node:after{display:none}
    .st .st-flow-platform{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;aspect-ratio:1;min-height:0;height:auto;flex:0 0 auto;padding:6px;gap:3px;text-align:center;background:linear-gradient(145deg,color-mix(in srgb,var(--node-color) 5%,var(--card)),var(--card) 75%)}.st-flow-platform .st-node-icon{width:28px;height:28px;margin:0;font-size:18px;color:var(--node-color);background:color-mix(in srgb,var(--node-color) 9%,var(--card));flex:none}.st-flow-platform strong{font-size:13px;line-height:1.25;flex:none}.st-flow-platform small{font-size:11px;line-height:1.2;margin:0;flex:none}.st-platform-tag{font-size:11px;line-height:1.25;margin:0;display:inline-flex;align-items:center;gap:4px;flex:none;white-space:nowrap;color:var(--green)}.st-platform-tag i{width:4px;height:4px;border-radius:50%;background:var(--green)}.st-platform-tag.warn{color:var(--amber)}.st-platform-tag.warn i{background:var(--amber)}
    .st .st-flow-hub{border-color:#d5cafa;background:linear-gradient(150deg,color-mix(in srgb,var(--accent) 5%,var(--card)),var(--card) 65%);box-shadow:0 7px 23px #00000007;padding:22px 15px}.st-hub-brand{text-align:center;padding-bottom:20px}.st-hub-symbol{margin:0 auto 12px;width:50px;height:50px;display:grid;place-items:center;color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,var(--card));border:1px solid #e1d9ff;border-radius:13px}.st-hub-brand strong{font-size:20px;letter-spacing:-.6px;color:var(--text)}.st-hub-brand small{font-size:11px;margin-top:5px;letter-spacing:.5px;color:var(--muted)}.st-hub-jobs{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:12px}.st-hub-job{display:flex;justify-content:space-between;gap:7px;align-items:center;font-size:11px;color:var(--muted)}.st-hub-job b{font-size:11px;font-weight:450;border:1px solid var(--line);padding:2px 5px;border-radius:5px;color:var(--text);background:var(--card)}.st-hub-foot{font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:12px;margin-top:16px;text-align:center}
    .st .st-library{padding:14px;background:var(--card);border-color:var(--line)}.st-library-head{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none}.st-library-head>div{min-width:0;flex:1}.st-library-head strong{white-space:normal;font-size:13px}.st-library-head small{margin-top:4px}.st-library-tree{display:grid;gap:6px;border-top:1px solid var(--line);margin-top:14px;padding-top:12px}.st-author-folder{border-radius:7px;background:var(--card);min-width:0;border:1px solid var(--line);transition:box-shadow .2s,border-color .2s}.st-author-folder.selected{border-color:#b7a2ff;box-shadow:0 5px 15px #00000012}.st-author-folder>summary{display:flex;align-items:center;gap:6px;padding:8px;list-style:none;cursor:pointer}.st-author-folder>summary>div{min-width:0;flex:1}.st-author-folder strong{font-size:12px}.st-author-folder small{font-size:11px;margin-top:2px}.st-author-folder>summary>b{font-size:11px;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums;flex:none}.st-author-docs{display:grid;gap:8px;margin:0 9px 10px 20px;padding:4px 0 5px 10px;border-left:1px solid var(--line)}.st .st-link-button{border:0;background:none;color:var(--accent);padding:0;font-size:11px;text-align:left}.st-author-docs>.st-link-button{justify-self:start;white-space:normal}.st-flow-exports{display:flex;gap:6px;flex-wrap:wrap}.st-flow-exports a{font-size:11px;padding:5px 7px;border:1px solid var(--line);border-radius:5px;color:var(--muted)}.st-library-foot{border-top:1px solid var(--line);margin-top:12px;padding-top:10px;color:var(--muted);font-size:11px}.st-chevron{display:inline-block;flex:none;color:var(--muted);transition:transform .2s}.st details:not([open])>summary .st-chevron{transform:rotate(-90deg)}.st details>summary::-webkit-details-marker{display:none}
    .st-flow-svg{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;overflow:visible}.st-flow-wire{fill:none;stroke-width:1.2;opacity:.4;transition:opacity .2s}.st-flow-wire.selected{opacity:.75}.st-flow-wire:not(.selected){opacity:.13}.st-flow-wire.active{stroke-dasharray:3 7;opacity:.8;animation:st-wire 1.8s linear infinite}.st-flow-particle{filter:drop-shadow(0 0 2px #f0444b55)}@keyframes st-wire{to{stroke-dashoffset:-20}}
    .st-flow-bottom{display:flex;justify-content:flex-end;gap:12px;align-items:center;margin:14px 1px 24px;font-size:11px;color:var(--muted)}.st-flow-legend{display:flex;gap:14px;flex-wrap:wrap}.st-flow-legend span{display:flex;align-items:center;gap:5px}.st-flow-legend i{width:4px;height:4px;border-radius:50%;background:#ee7880}.st-flow-legend .save{background:var(--green)}.st-flow-legend .wait{background:#c7a55d}.st-recent-head{display:flex;justify-content:space-between;align-items:center;margin:10px 1px 14px}.st-recent-head strong{font-weight:550;font-size:13px}.st-flow-recent{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.st-recent-item{border:1px solid var(--line);border-radius:13px;background:var(--card);padding:16px;min-width:0}.st-recent-item header{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text)}.st-recent-item time{font-size:11px;color:var(--muted);margin-left:auto}.st-recent-item p{font-size:12px;color:var(--muted);line-height:1.75;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:12px 0}.st-recent-item a{font-size:11px}.st-source-empty{border:1px dashed var(--line);border-radius:11px;padding:20px 14px;text-align:center;font-size:12px;color:var(--muted)}
    .st-preview .st-source-list .st-flow-node{min-height:38px;padding:6px 9px}.st-preview .st-source-list .st-flow-node small{display:none}.st-preview .st-author-folder>summary>div{display:flex;align-items:center;gap:7px}.st-preview .st-author-folder>summary strong{flex:1;min-width:0}.st-preview .st-author-folder>summary small{margin:0;flex:none}
    @container st-main (max-width:900px){.st-flow-stage{grid-template-columns:minmax(125px,1fr) 112px minmax(150px,.95fr) minmax(180px,1.25fr);padding:18px 12px;gap:16px}.st .st-flow-hub{padding:20px 10px}.st-hub-brand strong{font-size:18px}.st .st-library{padding:10px}.st-head{flex-wrap:wrap}.st-flow-recent{grid-template-columns:1fr}}
    @container st-main (max-width:720px){.st-flow-stage{display:flex;flex-direction:column;padding:16px;gap:24px;min-height:0}.st-flow-col{display:block;width:100%}.st-flow-svg,.st-flow-node:before,.st-flow-node:after{display:none}.st-flow-stack{display:flex;padding:0;gap:12px}.st-source-list{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.st-flow-col:nth-of-type(2) .st-flow-stack{display:grid;grid-template-columns:repeat(auto-fit,112px);justify-content:start;gap:14px}.st-flow-label{margin-bottom:12px}.st-flow-bottom{align-items:flex-start;flex-direction:column}.st-flow-top .totals{gap:12px}}
    @container st-app (max-width:600px){.st-layout{flex-direction:column}.st-aside{position:static;flex:none;width:100%;max-height:220px;padding:44px 12px 12px;border-right:0;border-bottom:1px solid var(--line);gap:10px}.st-brand{font-size:16px}.st-brand small{display:none}.st-nav{display:flex;flex-wrap:wrap;gap:4px}.st-nav>button{flex:1}.st-follow-menu{flex:1;min-width:130px}.st-follow-children{display:flex;max-width:100%;overflow-x:auto}.st .st-follow-children .st-target{width:auto;max-width:160px;flex:none}.st-account{margin:0;padding-top:6px;border:0}.st-main{width:100%;padding:16px 12px}.st-head{flex-wrap:wrap}.st-head-tools{flex-wrap:wrap}.st-stats{gap:8px}.st-stat{padding:10px}.st-stat strong{font-size:24px}.st-flow-stage{padding:12px}.st-card{padding:16px}}
    .st .st-author-select,.st .st-platform-select{border:0;background:transparent;padding:0;box-shadow:none;min-width:0}.st .st-author-select{flex:1;text-align:left;overflow:hidden}.st .st-platform-select{display:flex;flex-direction:column;align-items:center;gap:3px;width:100%}.st .st-source-list .st-flow-node{flex-wrap:wrap}.st .st-monitor-switch{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;padding:4px 7px;line-height:1.2;font-size:10px;border:1px solid #d8ceff;background:#f5f1ff;color:#6948d6;border-radius:20px;white-space:nowrap}.st-monitor-switch i{position:relative;display:block;width:23px;height:13px;background:#7b5cff;border-radius:9px;flex:none}.st-monitor-switch i:after{content:'';position:absolute;top:2px;left:12px;width:9px;height:9px;border-radius:50%;background:white}.st .st-monitor-switch.off{color:var(--muted);background:var(--inset);border-color:var(--line)}.st-monitor-switch.off i{background:#a3a5ac}.st-monitor-switch.off i:after{left:2px}.st-source-list .st-monitor-switch{margin-left:auto}.st-hub-brand .st-monitor-switch{margin-top:13px}.st-follow-menu>summary{cursor:pointer;color:var(--muted);font-size:12px;margin-bottom:12px}.st-follow-menu>summary span{float:right}
    .st .st-follow-menu>summary{display:flex;align-items:center;justify-content:space-between;gap:5px;list-style:none;font:inherit;color:var(--text);padding:9px 10px;border:1px solid transparent;border-radius:8px;margin:0}.st .st-follow-menu>summary.active{color:var(--accent);border-color:#d8ceff;background:color-mix(in srgb,var(--accent) 7%,var(--card))}.st-follow-children{border-left:1px solid var(--line);margin:8px 0 0 9px;padding-left:8px;display:grid;gap:5px}.st .st-follow-children .st-target{display:flex;align-items:center;gap:6px;margin:0;padding:6px 4px;font-size:11px!important;min-width:0}.st-follow-children .st-target>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st .st-target[aria-pressed=true]{color:var(--accent);border-color:#d8ceff}.st .st-source-list .st-author-node{border:0;box-shadow:none;background:transparent;padding:4px 0;flex-wrap:nowrap;gap:12px}.st-author-info{min-width:0;flex:1}.st-author-controls{display:flex;align-items:center;gap:8px;margin-top:5px}.st .st-author-select{flex:0 0 44px;width:44px;height:44px;border-radius:50%;overflow:visible}.st .st-flow-avatar{display:grid;place-items:center;width:44px;height:44px;border:2px solid var(--node-color,#7b5cff);padding:2px;border-radius:50%;background:var(--card);color:var(--text);overflow:hidden;flex:none}.st-flow-avatar>span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:color-mix(in srgb,var(--node-color,#7b5cff) 12%,var(--card))}.st-flow-avatar img{display:block;object-fit:cover;width:100%;height:100%;border-radius:50%}.st .st-flow-avatar.small{width:24px;height:24px;padding:1px;font-size:10px}.st .st-author-node.selected .st-flow-avatar{box-shadow:0 0 0 4px #7b5cff25}.st-author-node:before,.st-author-node:after{display:none}.st .st-author-select:hover{background:transparent;box-shadow:0 0 0 4px #7b5cff12}
    .st-page-title{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.st-page-title>.st-muted{flex-basis:100%;margin-left:43px}.st .st-back{display:inline-flex;align-items:center;justify-content:center;flex:none;width:34px;height:34px;padding:0}.st-back svg{display:block;flex:none}.st-author-title{display:grid;grid-template-columns:minmax(0,1fr) 24px;align-items:center;gap:2px 8px;min-width:0}.st-author-title strong{min-width:0;grid-area:1/1}.st-author-title>.st-link-button{grid-area:2/1;justify-self:start}.st-author-title>.st-node-gear{grid-area:1/2}.st .st-hub-job{width:100%;border:0;background:transparent;padding:3px 0;text-align:left}.st .st-hub-foot{width:100%;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent}.st .st-identity{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 0 18px}.st-identity>div{min-width:0;flex:1}.st-identity small{display:block;color:var(--muted)}.st-focused{outline:2px solid #b7a2ff;outline-offset:3px}.st-repair{background:#fbf7ee;border:1px solid #ead9b8;border-radius:8px;color:var(--amber);padding:10px;margin:12px 0}.st .st-flow-avatar,.st .st-author-select{border-radius:50%!important}.st .st-source-list .st-link-button{font-size:10px}
    .st-platform-logo,.st-weibo-logo{display:block;width:30px;height:30px;object-fit:contain}.st .st-flow-platform .st-node-icon:has(.st-weibo-logo){background:transparent}.st .st-flow-status{border:0;padding:5px 0;background:transparent;font-size:12px}.st-flow-status.blocked,.st-flow-status.cooldown{color:var(--amber)}.st-flow-status.blocked i,.st-flow-status.cooldown i{background:var(--amber)}.st-flow-status.paused,.st-flow-status.preview{color:var(--muted)}.st-flow-status.paused i,.st-flow-status.preview i{background:#a3a5ac}.st .st-effective.blocked,.st .st-effective.cooldown{color:var(--amber)}.st .st-effective.paused{color:var(--muted)}.st .st-effective.active{color:var(--green)}.st .st-sidebar-account{border:0;background:transparent;padding:5px 0;text-align:left;font-size:11px;width:100%}.st-empty-actions{justify-content:center}.st-frequency>summary{cursor:pointer;font-weight:550;font-size:14px}.st-frequency[open]>summary{margin-bottom:16px}.st-frequency .st-form{max-width:480px}
    .st-save-facts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin:15px 0}.st-save-facts dt{font-size:12px;color:var(--muted);margin-bottom:4px}.st-save-facts>div:nth-child(-n+3) dd{font-size:20px;font-weight:600;color:var(--up)}.st-save-facts dd{margin:0;font-size:14px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.st .st-history-choice{display:flex;align-items:center;gap:8px;flex-basis:100%;font-size:13px}.st .st-history-choice input{width:16px;min-width:16px;flex:none;margin:0;accent-color:var(--accent)}.st-choice-help{flex-basis:100%}.st .st-node-progress{font-size:10px;line-height:1.5;color:var(--muted);margin-top:4px;overflow-wrap:anywhere}.st-author-overviews{display:grid;gap:8px;margin:0 0 20px}.st .st-author-overview{display:flex;align-items:center;gap:12px;padding:12px 14px;text-align:left}.st-author-overview>div{min-width:0;flex:1}.st-author-overview strong{font-size:13px}.st-author-overview small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.st-author-overview>.st-caption{max-width:30%;font-size:11px}@container st-main (max-width:720px){.st-save-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.st-author-overview{flex-wrap:wrap}}
    .st .st-branch-paused .st-author-info,.st .st-branch-paused .st-flow-avatar,.st .st-flow-platform.st-branch-paused .st-platform-select{filter:grayscale(1);opacity:.38}.st .st-branch-paused .st-effective{color:var(--muted)}.st .st-platform-repair{border:0;background:transparent;padding:0;font-size:10px;line-height:1.1}.st-platform-fold-mark{position:absolute;top:6px;right:8px;color:var(--muted);font-size:12px}.st-flow-stage.st-collapse-sources{grid-template-columns:minmax(170px,1fr) minmax(220px,1.3fr)}.st-collapse-sources>.st-flow-col:nth-of-type(1),.st-collapse-sources>.st-flow-col:nth-of-type(2){display:none}.st .st-platform-tabs,.st .st-feed-filters{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.st-platform-tabs{border-bottom:1px solid var(--line);padding-bottom:0;margin-bottom:8px}.st .st-platform-tabs button{border:0;background:transparent;border-radius:0;padding:12px 24px;border-bottom:2px solid transparent}.st .st-platform-tabs [aria-selected=true]{color:var(--accent);border-bottom-color:var(--accent)}.st .st-feed-filters button{border:0;background:transparent;padding:7px 12px;font-size:12px}.st .st-feed-filters [aria-pressed=true]{color:var(--accent);background:#7b5cff0c}.st-feed-filters{margin-bottom:12px}.st .st-identity{padding:8px 0 18px;gap:10px}.st .st-identity>select{border:0;background:transparent;padding:6px 4px;max-width:320px;font-size:17px;font-weight:600}.st .st-identity>.st-identity-actions{margin-left:auto;flex:0 1 auto;display:flex;align-items:center;gap:14px}.st-author-more{position:relative;font-size:12px}.st-author-more>summary{cursor:pointer;list-style:none;color:var(--muted);padding:6px}.st-author-more>div{position:absolute;right:0;top:100%;min-width:190px;padding:14px;display:grid;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 25px #00000014;z-index:5}.st-author-more>div small{white-space:nowrap}.st .st-author-progress{border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:14px 0 16px;margin-bottom:20px}.st-save-facts{margin:0 0 14px;gap:12px}.st-save-facts dd small{display:block;font-size:11px;font-weight:400;color:var(--muted);margin-top:4px}.st-history-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.st-history-bar>button{font-size:12px;padding:6px 10px}.st-range-picker{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.st .st-range-picker select,.st .st-range-picker input{padding:6px 8px;font-size:12px;flex:none;min-width:0}.st-range-picker small{font-size:10px;color:var(--muted)}.st-range-picker input[type=date]{max-width:142px}.st-progress-details{margin-top:12px;font-size:11px;color:var(--muted)}.st-progress-details>summary{cursor:pointer}.st-progress-details[open] .st-save-facts{margin:14px 0}.st-progress-details .st-save-facts dd{font-size:12px;font-weight:400;color:var(--text)}.st-message-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.st-message-toolbar .st-feed-filters{margin:0}.st-message-list{border-top:1px solid var(--line)}.st-message-row{display:flex;align-items:flex-start;gap:14px;padding:16px 4px;border-bottom:1px solid var(--line);font-size:13px}.st-message-row.unread .st-message-copy p{font-weight:550}.st-message-type{display:inline-flex;align-items:center;justify-content:center;flex:none;min-width:44px;padding:3px 7px;color:var(--muted);background:var(--inset);border-radius:5px;font-size:11px;margin-top:2px}.st-message-type.attention{color:var(--amber);background:#c8992310}.st-message-type.update{color:var(--accent);background:#7b5cff0b}.st-message-copy{min-width:0;flex:1}.st-message-copy p{margin:0 0 5px;line-height:1.7;overflow-wrap:anywhere}.st-message-copy time{color:var(--muted);font-size:11px}.st .st-message-row button{font-size:11px;padding:4px 8px}.st .st-settings-page>.st-card,.st .st-settings-page>.st-frequency,.st .st-settings-page>.st-card.st-workspace{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:22px 0;margin:0}.st .st-settings-page> .st-card.st-focused{outline:0;border-left:2px solid #b7a2ff;padding-left:16px}.st-connection{display:flex;align-items:center;justify-content:space-between;gap:20px}.st-connection-copy{min-width:0;flex:1}.st-connection-state{font-size:13px;color:var(--amber);margin:5px 0!important}.st-connection-state.ready{color:var(--green)}.st-connection .st-caption{font-size:11px}.st-inline-error{color:var(--amber);font-size:12px}.st-development{padding:70px 20px;text-align:center;color:var(--muted)}.st-development h3{font-size:18px;color:var(--text)}.st-pagination{display:flex;justify-content:flex-end;align-items:center;gap:14px;margin:22px 0 10px}.st .st-quote{background:var(--inset);border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:10px 0 18px;white-space:normal}.st-quote>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;flex-wrap:wrap}.st-quote>summary strong{font-size:13px;color:var(--muted)}.st-quote-action{margin-left:auto;color:var(--accent);font-size:11px}.st-quote-action:before{content:'展开原博 ▾'}.st-quote[open] .st-quote-action:before{content:'收起原博 ▴'}.st-quote-preview{margin:3px 0 0!important;flex-basis:100%;font-size:12px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.st-quote[open] .st-quote-preview{display:none}.st-quote-body{white-space:pre-wrap;padding-top:12px;line-height:1.8;font-size:13px}.st-image-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;max-width:600px;margin:10px 0 16px}.st .st-image-grid button{position:relative;padding:0;overflow:hidden;border:1px solid var(--line);border-radius:7px;aspect-ratio:1;max-height:240px;background:var(--inset)}.st-image-loading{position:absolute;inset:0;display:grid;place-items:center;font-size:11px;color:var(--muted)}.st-post-footer{justify-content:flex-end}.st-image-grid:has(>button:only-child){grid-template-columns:minmax(0,1fr);max-width:360px}.st .st-image-grid>button:only-child{max-height:360px}.st-image-grid img{display:block;width:100%;height:100%;object-fit:cover}.st-image-failed{font-size:11px;padding:20px 10px;background:var(--inset);border-radius:7px}.st-lightbox{position:fixed;min-width:240px;min-height:140px;border:0;border-radius:10px;padding:36px 10px 10px;max-width:94vw;max-height:94vh;background:var(--card)}.st-lightbox::backdrop{background:#000a}.st-lightbox>img{display:block;margin:auto;max-width:90vw;max-height:82vh;object-fit:contain}.st .st-lightbox>button{position:absolute;z-index:1;right:8px;top:5px;font-size:12px;padding:3px 8px}@container st-main (max-width:720px){.st-message-row{gap:8px;flex-wrap:wrap}.st-message-row>.st-actions{margin-left:auto}.st-connection{align-items:flex-start;flex-direction:column}.st-image-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.st-identity>select{max-width:calc(100% - 60px)}.st-message-toolbar{flex-wrap:wrap}.st-flow-stage.st-collapse-sources{display:flex}}
    .st-setup-steps{display:flex;gap:24px;flex-wrap:wrap;padding:14px 30px;background:var(--inset);border-radius:8px;color:var(--muted);font-size:13px}.st-setup-steps [aria-current]{color:var(--accent);font-weight:600}.st-capture-choice{padding:20px 0}.st-capture-options{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px;margin:18px 0}.st-capture-options>section{padding:22px;border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}.st-capture-options p{color:var(--muted);line-height:1.7;margin:0}.st-capture-options button{margin-top:auto}.st-profile-total{line-height:1.8}
    .st .st-schedule-switch{display:flex;align-items:center;gap:8px}.st .st-schedule-switch input{width:16px;min-width:16px}.st-schedule-editor{display:grid;gap:14px;padding:14px;background:var(--inset);border-radius:8px}.st-schedule-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.st .st-schedule-row input{width:auto;min-width:0;max-width:125px}.st .st-schedule-row input[type=number]{width:65px}.st-schedule-row span{font-size:12px;color:var(--muted)}
    .st-layout{display:flex;width:100%;height:100%;min-width:0;min-height:0}.st .st-node-gear{display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:0;background:transparent;color:var(--muted)}.st-node-gear svg{display:block}.st-flow-platform>.st-node-gear{position:absolute;top:4px;left:4px}.st-hub-brand{position:relative}.st-hub-brand>.st-node-gear{position:absolute;right:0;top:0}.st .st-frequency-fields{display:grid;gap:14px;border:0;padding:0;margin:0;min-width:0}.st .st-node-dialog{width:min(620px,calc(100vw - 32px));max-height:90vh;padding:24px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);overflow:auto;box-shadow:0 20px 80px #0002}.st-node-dialog::backdrop{background:#1116}.st-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px}.st-dialog-head h2{margin:0;font-size:18px}.st .st-dialog-close{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;background:transparent}.st-dialog-section{border-top:1px solid var(--line);padding-top:18px;margin-top:20px}.st-dialog-section h3{font-size:14px}.st .st-node-dialog form{display:grid;gap:16px}.st-node-dialog form label:not(.st-schedule-switch){display:grid;gap:6px}.st-node-dialog form input:not([type=checkbox]){width:100%}.st-dialog-status{color:var(--green);font-size:12px}.st-history-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
    .st .st-frequency-note{display:block;max-width:100%;padding:4px 0;border:0;background:none;box-shadow:none;text-align:left;white-space:normal;line-height:1.6;color:var(--muted);font-size:10px}.st-frequency-value{color:var(--accent)}.st .st-frequency-note small{font-size:10px;line-height:1.6}.st-platform-group{min-width:0}.st-platform-group>.st-frequency-note{width:100%;text-align:center;padding-top:7px}.st .st-author-title button{font-size:10px}
    .st-flow-legend i{background:#8970ef}.st-flow-legend i.save{background:#f0444b}.st-flow-legend i.wait{background:#d9a52b}.st-probe-particle{filter:drop-shadow(0 0 4px #8970ef88)}.st-save-particle{filter:drop-shadow(0 0 6px #f0444bcc)}.st-probing .st-author-select:after{content:'';position:absolute;inset:0;border:1px solid #8970ef;border-radius:50%;opacity:0;pointer-events:none;animation:st-probe-ring 4s 1.7s infinite}.st-author-select{position:relative}.st-saving .st-flow-avatar{box-shadow:0 0 0 4px #f0444b22}.st-save-arrival{animation:st-save-arrival 4.2s ease-out}.st-save-feedback{color:#f0444b;font-weight:600;font-size:12px}@keyframes st-probe-ring{0%{transform:scale(1);opacity:.6}25%,100%{transform:scale(1.45);opacity:0}}@keyframes st-save-arrival{0%,30%,100%{box-shadow:none}52%,70%{box-shadow:0 0 0 4px #f0444b14,0 0 26px #f0444b22;border-color:#f3a2a6}}@media(prefers-reduced-motion:reduce){.st-probing .st-author-select:after,.st-save-arrival{animation:none}.st-save-arrival{border-color:#f0444b}}
    @media(pointer:coarse){.st summary,.st .st-author-docs button,.st .st-flow-exports a{min-height:44px}.st .st-flow-exports a{display:inline-flex;align-items:center}}
    @media(prefers-reduced-motion:reduce){.st-flow-wire.active{animation:none}.st-flow-particle{display:none}.st-flow-node,.st-chevron{transition:none}}
    .st .st-flow-scroll{overflow:hidden;height:clamp(480px,72vh,850px);cursor:grab;touch-action:none;overscroll-behavior:contain;background-color:var(--bg);background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:18px 18px}.st-flow-scroll.is-dragging{cursor:grabbing;user-select:none}.st-flow-surface{position:relative;overflow:hidden}.st .st-flow-stage{position:absolute;top:0;left:0;transform-origin:0 0;display:grid;grid-template-columns:minmax(260px,1fr) 140px minmax(220px,.9fr) minmax(260px,1.1fr);gap:28px;padding:28px;min-height:590px}.st .st-flow-stage.st-collapse-sources{grid-template-columns:minmax(220px,1fr) minmax(260px,1.1fr)}.st .st-flow-col{display:flex;width:auto}.st .st-flow-stack{display:flex;flex-direction:column;justify-content:center}.st .st-source-list{display:grid;grid-template-columns:1fr;gap:12px}.st .st-flow-svg{display:block}.st .st-source-list .st-author-node{border:1px solid var(--line);border-left:3px solid var(--node-color);background:var(--card);padding:12px;gap:14px;box-shadow:0 2px 6px #00000004}.st .st-source-list .st-author-node.selected{border-color:var(--accent);box-shadow:0 0 0 2px #7b5cff18}.st .st-author-detail{border-top:1px solid var(--line);margin-top:9px;padding-top:6px}.st-author-detail>summary{cursor:pointer;list-style:none;color:var(--muted);font-size:10px}.st-author-detail>summary:before{content:'＋';margin-right:5px}.st-author-detail[open]>summary:before{content:'－'}.st-author-detail>small{margin-top:5px}.st-canvas-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.st .st-canvas-tools button{font-size:11px;padding:5px 9px}.st-canvas-tools output{min-width:42px;text-align:center;font-variant-numeric:tabular-nums}.st-canvas-hint{color:var(--muted);font-size:10px;margin:6px 0 0}.st .st-flow-col:nth-of-type(2) .st-flow-stack{display:flex;justify-content:center}
    .st-streams{display:grid;gap:2px;margin:7px 0}.st .st-stream-status{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;border:0;background:transparent;padding:2px 0;font-size:11px;color:var(--muted);text-align:left}.st-stream-status b{font-weight:500;color:var(--muted)}.st-stream-status.is-running b{color:var(--green)}.st-cache-facts{display:grid;gap:7px;margin:16px 0;padding-bottom:14px;border-bottom:1px solid var(--line);font-size:12px}.st-cache-facts>div{display:flex;justify-content:space-between;gap:16px}.st-cache-facts dt{color:var(--muted)}.st-cache-facts dd{margin:0;text-align:right}.st .st-original-only{display:flex;align-items:center;gap:8px;margin:16px 0;font-size:12px}.st .st-original-only input{width:15px;height:15px;margin:0;accent-color:var(--accent)}.st-visibility-note{padding:10px 12px;border-radius:7px;background:var(--inset);font-size:12px;color:var(--muted)}.st-history-state{font-weight:550}.st-node-dialog .st-platform-tabs{margin-bottom:18px}.st-node-dialog .st-platform-tabs button{padding:10px 14px;font-size:13px}.st-node-dialog .st-author-detail .st-link-button{margin-top:4px}.st .st-node-dialog .st-platform-tabs button:hover{border-color:transparent}.st .st-node-dialog .st-platform-tabs button[aria-selected=true]{border-bottom-color:var(--accent)}
    .st .st-source-list .st-author-node{display:block}.st .st-author-node>.st-author-select{position:absolute;top:12px;right:12px}.st .st-author-node .st-author-title{min-height:44px;padding-right:56px}.st-stream-row{display:grid;grid-template-columns:minmax(0,1fr) 27px 28px;gap:9px;align-items:center;min-height:28px}.st .st-stream-row .st-stream-status{gap:8px}.st .st-source-list .st-job-switch{padding:0;border:0;background:transparent;margin:0;width:27px;min-width:27px}.st .st-stream-row>.st-link-button{font-size:10px;white-space:nowrap;text-align:right}.st .st-author-detail .st-frequency-note{font-size:10px}
    .st .st-frequency-note{display:flex;flex-wrap:wrap;align-items:center;gap:3px 6px}.st-frequency-note>span{white-space:nowrap}.st .st-platform-group>.st-frequency-note{display:flex;justify-content:center}
    .st .st-source-list .st-author-node.st-avatar-only{min-height:52px;padding:0;border:0;box-shadow:none;background:transparent}.st-avatar-only>.st-author-info{display:none}.st .st-author-node.st-avatar-only>.st-author-select{top:4px}
    .st-source-group[open]>summary{display:none}.st .st-development-platform{border-style:dashed;color:var(--muted);background:var(--inset);gap:8px}.st-development-platform:before,.st-development-platform:after{display:none}.st-development-platform .st-node-icon{color:var(--muted);background:var(--card)}
    .st .st-reader-facts{grid-template-columns:repeat(3,minmax(0,1fr))}.st-task-control{display:grid;grid-template-columns:56px 80px;align-items:center;gap:9px;min-height:32px;flex:none;font-size:11px}.st-task-label{color:var(--muted)}.st .st-state-pill{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:4px 7px;border:1px solid var(--line);background:var(--inset);color:var(--muted);border-radius:20px;white-space:nowrap;font-size:11px}.st .st-state-pill.running{color:var(--green);background:#27895c0c;border-color:#27895c30}.st .st-author-overview{border-bottom:1px solid var(--line);padding:16px 0;justify-content:space-between;background:transparent}.st .st-author-open{display:flex;align-items:center;gap:10px;min-width:0;flex:1;padding:0;border:0;background:transparent;text-align:left}.st-author-open>span{min-width:0}.st-author-open strong{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.st .st-reader-facts>div:last-child dd{color:var(--text);font-size:13px;font-weight:400}@container st-main (max-width:720px){.st .st-author-overview{align-items:stretch;flex-direction:column;gap:12px}.st-reader-facts>div:last-child{grid-column:1/-1}}
    .st .st-source-list{grid-template-columns:repeat(var(--avatar-columns,1),minmax(0,1fr));align-items:center}.st .st-source-list>.st-author-node{grid-column:1/-1}.st .st-source-list>.st-avatar-only{grid-column:auto;width:100%;min-width:52px}.st .st-author-node.st-avatar-only>.st-author-select{position:relative;top:auto;right:auto;display:block;margin:4px auto}
    .st-author-table-scroll{overflow-x:auto;margin-bottom:20px}.st .st-author-table{width:100%;min-width:760px;border-collapse:collapse;text-align:left;font-size:12px}.st-author-table th{color:var(--muted);font-weight:500;background:var(--inset)}.st-author-table th,.st-author-table td{padding:12px 10px;border-bottom:1px solid var(--line);white-space:nowrap}.st .st-author-table .st-author-overview{display:table-row}.st-author-table th:first-child{width:34%}.st .st-author-table .st-author-open{width:100%;max-width:300px}.st-author-table .st-task-label{display:none}.st-author-table .st-task-control{display:block;min-height:0}.st .st-author-table .st-author-open small{color:var(--muted);font-size:11px;margin-top:3px;display:block}.st .st-saved{position:fixed;z-index:20;bottom:24px;right:24px;max-width:min(540px,calc(100vw - 48px));display:flex;align-items:center;gap:12px;margin:0;box-shadow:0 6px 24px #00000014;background:var(--card);font-size:12px}.st-saved>span{overflow-wrap:anywhere}.st-saved>small{color:var(--muted);white-space:nowrap;font-size:10px}.st .st-saved>button{padding:0;border:0;background:transparent;font-size:20px;color:var(--muted)}



    .st-source-group:not([open])>summary{width:fit-content;max-width:100%;margin-left:auto;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--card);white-space:nowrap}.st-rule-scroll{overflow-x:auto}.st .st-rule-table{width:100%;border-collapse:collapse;text-align:left;font-size:12px}.st-rule-table th,.st-rule-table td{padding:12px 8px;border-bottom:1px solid var(--line);white-space:nowrap}.st-rule-table th{font-weight:500;color:var(--muted);background:var(--inset)}.st-rule-time,.st-rule-frequency{display:inline-flex;gap:5px;align-items:center}.st .st-rule-time input{width:96px;padding:7px 4px;font-size:12px}.st .st-rule-frequency input{width:54px;padding:7px 4px;font-size:12px}.st-rule-table td:last-child button{font-size:11px;padding:5px 7px}.st-frequency-fields>.st-caption{display:block;margin-top:12px}

    .st .st-nav>button{display:flex;align-items:center;justify-content:space-between;gap:8px}.st-nav-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:10px;background:color-mix(in srgb,var(--accent) 10%,var(--card));color:var(--accent);font-size:10px;line-height:1;font-weight:500}.st-history-pace{padding:14px 0;margin:12px 0;border-block:1px solid var(--line);font-size:12px}.st-history-pace label{display:grid;gap:8px}.st-history-pace input{max-width:130px}

    .st-independent{border-top:1px solid var(--line);padding-top:12px}.st-independent h3{font-size:13px;margin:0 0 10px}.st-independent-list{max-height:180px;overflow:auto}.st-independent-list>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:12px}.st-independent-list small{grid-column:1;color:var(--muted);line-height:1.6}.st-independent-list button{grid-column:2;grid-row:1/3;align-self:center}

    .st .st-library-tree{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding-top:14px}.st .st-library-tree .st-author-folder{margin:0;min-width:0}.st .st-library-tree .st-author-folder[open]{grid-column:1/-1}.st .st-library-tree .st-author-folder>summary{display:grid;grid-template-columns:24px minmax(0,1fr);gap:2px 6px;padding:10px;align-items:center}.st-library-tree .st-author-folder>summary>.st-chevron{display:none}.st-library-tree .st-author-folder>summary>.st-flow-avatar{grid-row:1/3}.st-library-tree .st-author-folder>summary>strong{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-library-tree .st-author-folder>summary>small{font-size:10px;margin:0}.st-library-tree .st-author-folder>summary>b{grid-column:1/-1;font-size:10px;font-weight:400;margin:5px 0 0;text-align:left;white-space:normal}.st-library-pages{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 0 0;font-size:11px;color:var(--muted)}.st .st-library-pages button{padding:2px 9px;font-size:16px}
    .st .st-meta-tag{display:inline-flex;align-items:center;max-width:100%;font-size:10px;font-weight:400;line-height:1.6;white-space:nowrap;padding:2px 6px;border:1px solid var(--line);border-radius:5px;background:var(--inset);color:var(--muted)}.st .st-author-open .st-uid-tag{margin-top:5px}.st .st-platform-badge{color:var(--accent);border-color:#7b5cff25;background:#7b5cff08}.st-author-table th:first-child{width:26%}.st .st-sort-heading{border:0;background:transparent;padding:0;display:inline-flex;gap:6px;align-items:center;color:inherit;font-size:12px}.st-sort-heading>span{color:var(--muted);font-size:10px}.st-reader-facts{max-width:900px}

    .st-reader-tabs{display:flex;align-items:center;gap:24px;border-bottom:1px solid var(--line);margin-bottom:20px}.st .st-reader-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;border-radius:0;padding:12px 2px;color:var(--muted);font-size:13px}.st .st-reader-tabs button[aria-selected=true]{border-bottom-color:var(--accent);color:var(--accent)}.st-inline-settings{max-width:900px;padding:0 0 24px}.st-inline-settings form{display:grid;gap:16px}.st-inline-settings form label:not(.st-schedule-switch){display:grid;gap:6px}.st-inline-settings .st-task-control{grid-template-columns:72px auto;justify-content:start}.st-inline-settings .st-history-panel{max-width:700px}.st .st-author-progress{border-top:0;padding-top:0}.st-inline-settings .st-history-panel>.st-caption{margin-bottom:14px}

    .st-agent-capabilities{display:grid;gap:10px;border-block:1px solid var(--line);padding:14px 0;margin:16px 0}.st-agent-capabilities>div{display:grid;gap:3px;font-size:12px}.st-agent-capabilities span{color:var(--muted);font-size:11px}.st-agent-guide{padding-left:20px;font-size:12px;color:var(--muted);line-height:1.9}.st .st-agent-dialog form{margin-top:18px}.st .st-agent-dialog .st-agent-check{display:flex;align-items:center;gap:8px;font-size:12px}.st .st-agent-check input{width:15px;height:15px;margin:0;flex:none}.st-agent-authors{max-height:180px;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.st-agent-receipts{max-height:220px;overflow:auto;font-size:12px}.st-agent-receipts>div{display:grid;grid-template-columns:1fr auto;gap:4px 12px;border-bottom:1px solid var(--line);padding:10px 0}.st-agent-receipts small{grid-column:1/-1;color:var(--muted)}.st .st-agent-node-state{padding:10px 14px 0;color:var(--muted);font-size:10px}

    .st .st-agent-dialog{width:min(740px,calc(100vw - 32px))}.st .st-node-dialog>.st-dialog-head{position:sticky;top:-24px;z-index:3;background:var(--card);padding:14px 0;margin-top:-14px;border-bottom:1px solid var(--line)}.st .st-agent-dialog .st-reader-tabs{margin-bottom:4px}.st-setting-group{padding:16px 0;border-bottom:1px solid var(--line)}.st-setting-group h3,.st-setting-group-head h3{margin:0;font-size:12px;font-weight:600}.st-setting-group-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.st .st-setting-group-head>button{font-size:11px}.st-setting-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(0,340px);align-items:center;gap:16px;padding:13px 0;min-width:0}.st-setting-copy{min-width:0;font-size:13px}.st-setting-copy>label,.st-setting-copy>span{font-weight:500}.st-setting-copy>small{display:block;max-width:290px;color:var(--muted);font-size:11px;line-height:1.6;margin-top:4px}.st-setting-control{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.st .st-setting-control>select{width:100%;min-width:0;max-width:100%;font-size:12px;padding:8px 10px;text-overflow:ellipsis}.st .st-setting-control>input:not([type=checkbox]){width:100%;min-width:0;font-size:12px;padding:8px 10px}.st-setting-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:4px}.st .st-setting-actions>button{font-size:11px;padding:6px 10px}.st-setting-actions>small{flex-basis:100%;text-align:right}.st .st-setting-toggle{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)}.st input[role=switch]{appearance:none;position:relative;flex:none;width:32px!important;height:19px;margin:0;border:0!important;border-radius:12px;background:#a1a4aa;cursor:pointer;padding:0!important;vertical-align:middle}.st input[role=switch]:before{content:'';position:absolute;left:3px;top:3px;width:13px;height:13px;background:white;border-radius:50%;transition:transform .15s}.st input[role=switch]:checked{background:var(--accent)}.st input[role=switch]:checked:before{transform:translateX(13px)}.st input[role=switch]:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.st input[role=switch]:disabled{opacity:.45;cursor:wait}.st-setting-help{border-bottom:1px solid var(--line);padding:14px 0;font-size:12px;color:var(--muted)}.st-setting-help>summary{cursor:pointer;font-size:12px;list-style-position:inside}.st-setting-help[open]>summary{color:var(--text);margin-bottom:10px}.st .st-agent-authors{padding:10px;border:1px solid var(--line);border-radius:8px;margin:8px 0}.st-agent-delivery-scroll{overflow:auto;max-height:440px;margin-top:12px}.st .st-agent-deliveries{width:100%;border-collapse:collapse;font-size:12px;text-align:left}.st-agent-deliveries th{font-weight:500;color:var(--muted);background:var(--inset);position:sticky;top:0}.st-agent-deliveries th,.st-agent-deliveries td{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}.st-agent-deliveries td:last-child{white-space:nowrap;font-size:11px;color:var(--muted)}.st-agent-deliveries small{display:block;max-width:260px;line-height:1.6;color:var(--muted);margin-top:4px}.st-delivery-state.sent{color:var(--green)}.st-delivery-state.uncertain,.st-delivery-state.failed{color:var(--amber)}.st .st-dialog-status{display:flex;justify-content:space-between;gap:12px;padding:8px 0;margin:8px 0;font-size:12px}.st-dialog-status small{font-size:10px;color:var(--muted)}.st .st-schedule-switch{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--line);font-size:13px}.st .st-original-only{justify-content:space-between;padding:13px 0;margin:0;border-bottom:1px solid var(--line);font-size:13px}.st-history-panel>.st-setting-row{border-bottom:1px solid var(--line)}.st .st-history-pace{margin:0;padding:0 0 12px;border-top:0;gap:0}.st-history-pace>.st-setting-row input{max-width:100px}.st .st-history-pace>button{justify-self:end;font-size:11px;padding:6px 10px}.st .st-node-dialog form>.st-primary,.st .st-inline-settings form>.st-primary{justify-self:end;width:auto;font-size:12px;padding:8px 16px}.st .st-settings-page{max-width:1040px}.st .st-settings-page .st-workspace .st-form{max-width:none}.st-workspace .st-setting-row{grid-template-columns:minmax(150px,1fr) minmax(0,520px)}.st-workspace .st-setting-control>.st-actions{justify-content:flex-end;width:100%}.st-settings-page .st-card>h3{font-size:13px;margin-top:0}.st .st-history-state{display:flex;align-items:center;font-size:13px;margin:4px 0 14px}.st .st-visibility-note{font-size:11px;padding:8px 10px;line-height:1.6}.st .st-node-dialog .st-rule-table th,.st .st-node-dialog .st-rule-table td{padding:10px 6px}.st .st-agent-dialog .st-inline-error{padding:8px 0;margin:0;line-height:1.6}
    @media(max-width:560px){.st .st-setting-row{grid-template-columns:1fr;gap:8px}.st .st-setting-control{justify-content:flex-start}.st .st-setting-toggle{width:100%;justify-content:space-between}.st-setting-copy>small{max-width:none}.st .st-node-dialog{padding:18px}.st .st-node-dialog>.st-dialog-head{top:-18px}.st-setting-group-head{align-items:flex-start}.st-setting-actions>small{text-align:left}}
    @container st-main (max-width:650px){.st-workspace .st-setting-row{grid-template-columns:1fr}.st-workspace .st-setting-copy>small{max-width:none}}
    .st .st-follow-fold{display:grid;place-items:center;flex:none;width:28px;height:28px;padding:0;border:0;background:transparent;color:inherit;border-radius:5px;font-size:18px;line-height:1}.st .st-follow-fold:hover{background:#7b5cff12}.st-rule-editor{display:grid;gap:8px;min-width:200px}.st .st-rule-editor>select{width:100%;padding:6px 8px;font-size:12px}.st .st-rule-date{display:grid;gap:4px;font-size:11px;color:var(--muted)}.st .st-rule-date input{width:100%;padding:6px 4px;font-size:12px}.st-rule-description{display:block;max-width:250px;white-space:normal;line-height:1.6}.st-rule-description>small{display:block;color:var(--muted);font-size:11px;margin-top:3px}
    .st .st-follow-menu>summary{align-items:center;min-height:42px}.st .st-follow-menu>summary .st-follow-label{float:none;line-height:24px}.st .st-follow-fold{align-self:center;height:24px;width:24px;pointer-events:none}.st-follow-fold svg{display:block;margin:0}.st .st-stream-row{grid-template-columns:minmax(0,1fr) auto}.st .st-feed-filters button{display:inline-flex;align-items:center;gap:6px}.st .st-message-type.read{background:transparent;color:var(--muted);font-weight:400}.st .st-settings-page{max-width:960px}.st .st-settings-page>.st-connection{display:block}.st .st-settings-page .st-setting-row{grid-template-columns:155px minmax(0,1fr);gap:28px;padding:6px 0}.st .st-settings-page .st-setting-control{justify-content:flex-start}.st .st-settings-page .st-setting-control>.st-actions{justify-content:flex-end}.st-account-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;width:100%}.st-account-controls>button:first-of-type{margin-left:auto}.st .st-settings-page .st-setting-help{border-bottom:0;margin-left:183px;padding:12px 0 0;font-size:11px}.st .st-settings-page .st-setting-help p{font-size:11px;line-height:1.7}.st-settings-footer{font-size:11px;color:var(--muted);margin-top:18px}.st .st-settings-page .st-setting-copy small{max-width:none}.st .st-settings-page>.st-card{padding:22px 0}.st-workspace #st-workspace-path{font-size:12px}.st .st-settings-page .st-inline-error{margin-left:183px}
    @container st-main (max-width:650px){.st .st-settings-page .st-setting-row{grid-template-columns:1fr;gap:10px}.st .st-settings-page .st-setting-help,.st .st-settings-page .st-inline-error{margin-left:0}.st-account-controls>button:first-of-type{margin-left:auto}}
    .st .st-settings-page>.st-card.st-focused{border-left:0;padding-left:0;border-bottom-color:#d8ceff}
    .st-event-times{display:flex;flex-wrap:wrap;gap:4px 16px;color:var(--muted);font-size:11px;line-height:1.8;margin-top:5px}.st-event-times>span{white-space:nowrap}.st-agent-deliveries .st-event-times{display:grid;gap:2px;margin:0}.st-agent-deliveries td:last-child>div:last-child{line-height:1.8}
    @container st-app (max-width:600px){.st .st-aside{max-height:300px}.st .st-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.st .st-nav>button,.st .st-follow-menu>summary{white-space:nowrap;font-size:12px;min-height:42px}.st .st-follow-menu{min-width:0}.st .st-follow-children{display:grid;max-height:112px;overflow:auto;margin-top:4px}.st .st-follow-children .st-target{width:100%;max-width:none;min-width:0}}

    .st-im-summary{display:grid;gap:7px;font-size:12px;text-align:left;min-width:0}.st-im-summary>strong{font-size:14px}.st-im-summary>span{color:var(--muted)}.st-im-summary small{color:var(--muted);font-size:11px;line-height:1.6;overflow-wrap:anywhere}.st-im-summary.warning>span{color:var(--amber)}.st .st-im-summary.compact{border:0;background:var(--inset);width:100%;padding:10px 12px;margin-top:10px;border-radius:8px;gap:4px}.st-im-route{display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid var(--line);padding-top:8px}.st-im-route span{min-width:0;overflow-wrap:anywhere}.st-im-route b{font-weight:500;font-size:11px;flex-shrink:0;color:var(--muted)}.st-im-route b.failed,.st-im-route b.invalid{color:var(--amber)}.st-im-route b.accepted{color:var(--green)}.st .st-im-node{padding:16px;margin-top:18px;border-color:var(--line);background:var(--card)}.st-im-node>.st-link-button{margin-top:14px}.st .st-destination-row{display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line);padding:12px 0}.st-destination-row>div{flex:1;min-width:0;overflow-wrap:anywhere}.st-destination-row strong{font-size:12px}.st-destination-row small{display:block;color:var(--muted);font-size:10px;margin-top:4px}.st .st-destination-row .st-setting-toggle{width:auto;gap:8px}.st .st-destination-row button{padding:5px 9px}.st-settings-page .st-settings-im{padding:24px 0;border-bottom:1px solid var(--line)}.st-settings-im h2{font-size:15px;margin:0 0 14px}.st-settings-im>button{margin-top:14px}.st .st-settings-page{max-width:1000px}.st .st-settings-page>.st-card{padding:24px;background:var(--card);border:1px solid var(--line);border-radius:12px;margin:20px 0}.st .st-settings-page .st-setting-row{grid-template-columns:165px minmax(0,1fr);gap:24px;padding:10px 0}.st .st-settings-page .st-setting-copy>span,.st .st-settings-page .st-setting-copy>label{font-size:14px;font-weight:550}.st .st-settings-page .st-setting-copy small{font-size:12px;line-height:1.7}.st .st-settings-page .st-setting-help{margin-left:189px}.st .st-settings-page .st-inline-error{margin-left:0}.st .st-settings-page .st-setting-control input,.st .st-settings-page button{font-size:13px}.st .st-settings-page>.st-setting-row{padding:16px 20px;border:1px solid #e8d7b8;border-radius:10px;background:#d9a52b07;margin:12px 0}.st .st-settings-page .st-account-controls{justify-content:flex-start}.st .st-settings-page .st-connection-state{font-size:13px}.st .st-settings-page .st-setting-help p{font-size:12px}.st-settings-footer{line-height:1.7}.st .st-settings-page>.st-card.st-workspace,.st .st-settings-page>.st-settings-im{padding:24px;border:1px solid var(--line);border-radius:12px;background:var(--card);margin:20px 0}.st .st-settings-page .st-form{max-width:none}
    @container st-main (max-width:650px){.st .st-settings-page>.st-card,.st .st-settings-page>.st-card.st-workspace,.st .st-settings-page>.st-settings-im{padding:16px}.st .st-settings-page .st-setting-row{grid-template-columns:1fr;gap:10px}.st .st-settings-page .st-setting-help{margin-left:0}.st .st-destination-row{flex-wrap:wrap}.st-destination-row>div{flex-basis:100%}.st-im-route{flex-wrap:wrap}.st .st-im-summary.compact{padding:8px}}

    .st .st-im-sidebar{display:grid;gap:0;margin:0;padding:0}.st .st-im-sidebar .st-sidebar-account{margin:0;background:transparent;border:0;border-radius:0;font-size:11px;font-weight:400;line-height:1.6;text-align:left;align-items:center}.st .st-im-sidebar .st-dot.paused{background:#a4a7ad}.st .st-im-sidebar .st-dot.failed{background:var(--amber)}.st .st-add-channel .st-setting-row{padding:16px 0}.st .st-add-channel .st-setting-help{margin-top:24px}.st .st-agent-dialog>.st-reader-tabs{gap:12px}.st .st-agent-dialog>.st-reader-tabs button{white-space:nowrap}

    .st .st-version-entry{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:10px 0;margin-top:12px;border:0;border-top:1px solid var(--line);border-radius:0;background:transparent;font-size:11px;color:var(--muted)}.st-update-available{color:var(--accent);font-weight:600}.st .st-update-dialog{width:min(560px,94vw)}.st-version-compare{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;padding:20px;border:1px solid var(--line);border-radius:12px;background:var(--inset);margin:18px 0}.st-version-compare small{display:block;color:var(--muted);font-size:12px;margin-bottom:8px}.st-version-compare strong{font-size:24px;overflow-wrap:anywhere}.st-version-compare>span{color:var(--muted);font-size:22px}.st-version-compare>div:last-child strong{color:var(--accent)}.st-update-status{font-size:13px;line-height:1.8;overflow-wrap:anywhere}.st-update-dialog>.st-caption{font-size:11px;line-height:1.8;margin-top:18px}.st-update-command{font-size:12px;color:var(--muted);margin-top:18px}.st-update-command>summary{cursor:pointer}.st-update-command code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;margin-top:10px;background:var(--inset);border-radius:8px}.st-update-dialog .st-actions a{font-size:12px}
  `;
  const labels = { ready: '已连接', cooling_down: '冷却中', needs_login: '需要登录', needs_verification: '需要验证', paused: '已暂停',
    queued: '按计划执行', needs_review: '需要检查', complete: '已到可访问末尾' };
  const channelNames = { weixin: '微信', qq: 'QQ', feishu: '飞书', dingtalk: '钉钉', telegram: 'Telegram', slack: 'Slack', discord: 'Discord', wecom: '企业微信' };
  const pushDestinations = config => Array.isArray(config?.destinations) ? config.destinations : config?.botId && config?.targetId ? [{ botId: config.botId, targetId: config.targetId, enabled: true }] : [];
  const pushLabels = { unavailable: 'dsh-im 未接入', paused: '已暂停', checking: '正在读取配置', invalid: '配置需检查', failed: '发送失败', accepted: '最近发送成功', configured: '已配置 · 尚无成功发送记录' };
  const platformNames = { weibo: '微博', xueqiu: '雪球', x: 'X', bilibili: 'B 站', rednote: '小红书' };
  const platformAccount = (state, id) => state.accounts?.[id] || state.account;
  const platformReady = (state, id) => {
    const account = platformAccount(state, id);
    return state.enabled !== false && state.platforms?.find(source => source.id === id)?.enabled !== false && account?.status === 'ready' && account.cooldown_until <= Date.now()
      && !(state.platforms?.find(source => source.id === id)?.stopped ?? state.stopped);
  };
  const date = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '—';
  const intervalText = ms => !Number.isFinite(ms) || ms <= 0 ? '频率待确认' : ms === 3600000 ? '每小时' : '每 ' + ms / 60000 + ' 分钟';
  function checkInterval(state, platform, uid = '') {
    const source = state?.platforms?.find(item => item.id === platform);
    return state?.progress?.find(item => item.uid === uid)?.intervalMs ?? source?.frequency?.intervalMs
      ?? state?.targets.find(item => item.uid === uid)?.interval_ms ?? source?.targetDefaults?.intervalMs ?? state?.targetDefaults?.intervalMs;
  }
  const chinaClock = (value, seconds = true) => new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
  const taskProblem = job => job.kind === 'history' && /长文接口未返回全文/.test(job.message || '')
    ? '有一条长内容暂时无法完整读取，历史缓存已暂停；已保存内容保留，新动态监控不受此问题影响。'
    : (job.kind === 'history' ? '历史缓存已暂停：' : '新动态检查已暂停：') + (job.message || '读取未完成，请重试');
  function monitorStatus(state, platform = 'weibo', uid = '') {
    const target = state?.targets.find(item => item.uid === uid);
    const source = state?.platforms?.find(item => item.id === platform);
    const account = state && platformAccount(state, platform);
    const result = (label, kind, reason, section = 'account') => ({ label, kind, reason, section });
    if (state?.update?.phase === 'applying') return result('插件更新中', 'paused', '等待版本更新完成，监控配置保持不变', 'service');
    if (!state || state.stopped) return result('后台未就绪', 'blocked', state?.serviceError || '等待本地服务连接');
    if (state.enabled === false) return result('总控已暂停', 'paused', '开启总控制器后继续，博主和平台设置保持不变');
    if (source?.stopped) return result('平台后台未就绪', 'blocked', '请检查插件后台状态', 'service');
    if (source?.enabled === false) return result('平台已暂停', 'paused', '开启平台开关后继续');
    if (target?.capture_mode === 'pending') return result('待确认记录方式', 'paused', '读取博主资料后，选择从现在记录或补存历史', 'archive');
    if (target?.enabled === false) return result('任务已暂停', 'paused', '在大屏单独开启新动态或历史缓存后继续');
    if (account?.status !== 'ready') return result(account?.status === 'needs_login' ? '等待登录' : account?.status === 'needs_verification' ? '需要验证' : '连接待恢复', 'blocked', account?.reason || '请先确认' + (platformNames[platform] || platform) + '账号连接');
    if (account.cooldown_until > Date.now()) return result(account.errors ? '采集异常 · 等待重试' : '冷却中', 'cooldown', (account.reason ? account.reason + '；' : '') + '不早于 ' + date(account.cooldown_until) + ' 继续');
    const targets = state.targets.filter(item => (item.platform || 'weibo') === platform && (!uid || item.uid === uid));
    if (targets.length && targets.every(item => item.capture_mode === 'pending')) return result('等待配置博主', 'paused', '选择博主并确认记录方式', 'archive');
    if (targets.length && targets.every(item => item.enabled === false)) return result('博主均已暂停', 'paused', '选择至少一位博主开启监控', 'archive');
    const jobs = state.jobs.filter(job => (!uid || job.uid === uid) && (job.platform || state.targets.find(item => item.uid === job.uid)?.platform || 'weibo') === platform);
    const problems = jobs.filter(job => job.status === 'needs_review');
    if (problems.length) {
      const historyOnly = problems.every(job => job.kind === 'history');
      const names = [...new Set(problems.map(job => state.targets.find(item => item.uid === job.uid)?.name || job.uid))];
      return result(historyOnly ? names.length + ' 位博主的历史缓存已暂停' : names.length + ' 位博主的新动态检查需处理', jobs.some(job => job.status === 'queued') ? 'partial' : 'blocked', names.join('、') + '：' + taskProblem(problems[0]), 'tasks');
    }
    if (jobs.length && jobs.every(job => ['paused', 'complete'].includes(job.status))) return result('任务已暂停', 'paused', '在大屏开启需要执行的任务', 'tasks');
    const active = state.activeJobIds || [state.activeJobId];
    if (jobs.some(job => active.includes(job.id))) return result('正在读取', 'active', '新内容保存后会显示在本地档案中');
    return result(jobs.length ? '监控中' + (uid ? ' · ' + intervalText(checkInterval(state, platform, uid)) : '') : '监控就绪', 'ready', '更新按设置的检查间隔执行，历史内容分批缓存');
  }
  function overviewStatus(state, preferred) {
    const platforms = [...new Set(state?.targets.map(target => target.platform || 'weibo') || [])];
    const statuses = (platforms.length ? platforms : [preferred]).map(platform => ({ ...monitorStatus(state, platform), platform }));
    if (!state || state.stopped || state.enabled === false) return statuses[0];
    const working = statuses.find(status => ['ready', 'active', 'cooldown'].includes(status.kind));
    const blocked = statuses.find(status => ['blocked', 'partial'].includes(status.kind));
    if (working && blocked) return { ...blocked, label: '部分平台需处理', kind: 'partial', reason: statuses.map(status => platformNames[status.platform] + '：' + status.label).join('；') };
    return working || blocked || statuses[0];
  }
  function progressFor(state, uid) {
    const supplied = state.progress?.find(item => item.uid === uid);
    if (supplied) return supplied;
    const saved = state.archiveSummary?.find(item => item.uid === uid);
    const history = state.jobs.find(job => job.uid === uid && job.kind === 'history');
    return { uid, saved: saved?.count || 0, originals: saved?.original_count ?? null, reposts: saved?.repost_count ?? null, lastSavedAt: saved?.last_saved_at || null, lastCheckedAt: null, nextCheckAt: null,
      history: { id: history?.id, status: history?.status || 'not_started', rangeBounded: false, started: !!history?.pages, pages: history?.pages || 0,
        oldestAt: history?.oldestAt || null, reportedTotal: null, estimatedRemaining: null, message: history?.message || '' } };
  }
  const totalText = history => history.reportedTotal === null ? '总数待确认' : '约 ' + history.reportedTotal.toLocaleString() + ' 条';
  function streamStatus(state, target, kind) {
    const job = state.jobs.find(job => job.uid === target.uid && job.kind === kind);
    if (target.capture_mode === 'pending' || !job) return '待设置';
    if (job?.status === 'complete') return '已完成';
    if (kind === 'history' && job.status === 'paused' && /未开启历史缓存|尚未开启历史缓存/.test(job.message || '')) return '未开启';
    if (state.enabled === false || state.platforms?.find(item => item.id === target.platform)?.enabled === false || target.enabled === false || job?.status === 'paused') return '已暂停';
    if (job.status === 'needs_review') return '需处理';
    if (!platformReady(state, target.platform || 'weibo')) return '等待连接';
    if (kind === 'updates' && progressFor(state, target.uid).catchup) return '补查中';
    return kind === 'history' ? '缓存中' : '监控中';
  }
  const day = value => value ? new Date(value + 8 * 3600000).toISOString().slice(0, 10) : '';
  const rangeValue = target => ({ preset: target.history_from || target.history_to ? 'custom' : 'all', from: day(target.history_from), to: day(target.history_to) });
  const presetRange = preset => {
    if (preset === 'all') return { preset, from: '', to: '' };
    const now = Date.now(), end = day(now), start = new Date(end + 'T00:00:00Z');
    start.setUTCDate(start.getUTCDate() - ({ month: 29, quarter: 89, year: 364 }[preset] || 0));
    return { preset, from: start.toISOString().slice(0, 10), to: end };
  };
  const unreadFor = (state, uid) => state.unreadContent?.authors?.find(item => item.uid === uid)?.count || 0;
  const unreadNotices = (state, kind = 'all') => state?.unreadNotices?.[kind] ?? state?.notices.filter(item => !item.read_at && (kind === 'all' || item.kind === kind)).length ?? 0;
  const previewState = () => {
    const groups = [['weibo', ['示例博主 A', '示例博主 B', '示例博主 C']]];
    const targets = groups.flatMap(([platform, names]) => names.map((name, index) => ({ uid: `preview-${platform}-${index}`, name, platform })));
    return { targets, count: 0, archiveSummary: [], jobs: [], notices: [], activeJobIds: [], stopped: false,
      accounts: Object.fromEntries(groups.map(([id]) => [id, { status: 'needs_login', cooldown_until: 0 }])),
      platforms: groups.map(([id]) => ({ id, name: platformNames[id], stopped: false })) };
  };

  async function api(path, body, signal) {
    const response = await fetch(BASE + path, body === undefined ? { cache: 'no-store', signal } : {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Social-Trace': '1' }, body: JSON.stringify(body),
    });
    const text = await response.text();
    let result;
    try { result = text.trim() ? JSON.parse(text) : null; } catch { throw new Error(`本地接口返回了非 JSON 内容（HTTP ${response.status}），请检查插件后台是否正常启动`); }
    if (!response.ok) {
      const error = new Error(result?.error || `插件后台接口暂不可用（HTTP ${response.status}）。请检查插件组件状态与资料库占用情况`);
      error.kind = result?.kind; error.status = response.status; throw error;
    }
    if (!result || typeof result !== 'object') throw new Error('插件后台返回了空响应，请检查插件组件状态后重试');
    if (path === '/status' && (!Array.isArray(result.targets) || !Array.isArray(result.jobs) || !Array.isArray(result.notices) || !result.account)) {
      throw new Error('插件后台返回的状态不完整，请重新启用插件后重试');
    }
    if (path.startsWith('/posts?') && !Array.isArray(result.items)) throw new Error('档案列表响应不完整，请重试');
    return result;
  }

  function factory(require) {
    const React = require('react');
    const h = React.createElement;
    function AuthorAvatar({ target, size = '', style }) {
      const [failed, setFailed] = React.useState(false);
      React.useEffect(() => setFailed(false), [target.avatar_url]);
      return h('span', { className: 'st-flow-avatar ' + size, style, title: target.name },
        target.avatar_url && !failed ? h('img', { src: `${BASE}/avatar?uid=${encodeURIComponent(target.uid)}&v=${encodeURIComponent(target.avatar_url)}`, alt: target.name + '的头像', referrerPolicy: 'no-referrer',
          onError: () => setFailed(true) }) : h('span', { 'aria-label': target.name + '暂无头像' }, /^\d+$/.test(target.name) ? (platformNames[target.platform || 'weibo'] || '博主').slice(0, 1) : target.name.slice(0, 1)));
    }
    function RangePicker({ value, change, disabled, label = '历史缓存范围' }) {
      return h('div', { className: 'st-range-picker' }, h('select', { value: value.preset, disabled, 'aria-label': label,
        onChange: event => change(event.target.value === 'custom' ? { ...value, preset: 'custom' } : presetRange(event.target.value)) },
        [['month', '最近 30 天'], ['quarter', '最近 90 天'], ['year', '最近一年'], ['all', '不限时间'], ['custom', '自选日期']].map(([key, title]) => h('option', { key, value: key }, title))),
        value.preset === 'custom' ? h(React.Fragment, null,
          h('input', { type: 'date', value: value.from, max: value.to || day(Date.now()), disabled, 'aria-label': label + '开始日期', onChange: event => change({ ...value, from: event.target.value }) }),
          h('span', null, '至'), h('input', { type: 'date', value: value.to, min: value.from, max: day(Date.now()), disabled, 'aria-label': label + '结束日期', onChange: event => change({ ...value, to: event.target.value }) }))
          : value.from ? h('small', null, value.from, ' 至 ', value.to) : null);
    }
    function GearIcon() {
      return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round', 'aria-hidden': true },
        h('circle', { cx: 12, cy: 12, r: 7 }), h('path', { d: 'M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2', strokeWidth: 3 }), h('circle', { cx: 12, cy: 12, r: 3 }));
    }
    const repeatLabels = { weekdays: '工作日（周一至周五）', daily: '每天', once: '单次', weekly: '每周', biweekly: '每双周', monthly: '每月', yearly: '每年' };
    function repeatText(window) {
      if (!window.repeat || window.repeat === 'daily') return '每天';
      if (window.repeat === 'weekdays') return '工作日（周一至周五）';
      if (!window.date) return repeatLabels[window.repeat] + '（请选择日期）';
      const date = new Date(window.date + 'T00:00:00Z');
      if (window.repeat === 'once') return window.date;
      if (window.repeat === 'weekly' || window.repeat === 'biweekly') return (window.repeat === 'weekly' ? '每周' : '每两周 · 周') + '日一二三四五六'[date.getUTCDay()] + '（自 ' + window.date + '）';
      return window.repeat === 'monthly' ? '每月 ' + date.getUTCDate() + ' 日（自 ' + window.date + '）' : '每年 ' + (date.getUTCMonth() + 1) + ' 月 ' + date.getUTCDate() + ' 日';
    }
    function FrequencyFields({ value: settings, change: setSettings, disabled }) {
      const [editing, setEditing] = React.useState(null);
      const edit = (key, label) => h('button', { type: 'button', 'aria-label': '修改' + label, onClick: () => setEditing(editing === key ? null : key) }, editing === key ? '收起' : '修改');
      const setWindow = (index, key, value) => setSettings({ ...settings, schedule: { ...settings.schedule, windows: settings.schedule.windows.map((row, i) => i === index ? { ...row, [key]: value } : row) } });
      const number = (value, label, change) => h('span', { className: 'st-rule-frequency' }, '每', h('input', { type: 'number', min: 1, max: 10080, required: true, 'aria-label': label, value, onChange: event => change(Number(event.target.value)) }), '分钟检查一次');
      return h('fieldset', { className: 'st-frequency-fields', disabled },
        h('label', { className: 'st-schedule-switch' }, h('span', null, '按不同时段安排检查'), h('input', { type: 'checkbox', role: 'switch', 'aria-label': '按时间段调整频率（北京时间）', checked: settings.schedule.enabled,
          onChange: event => setSettings({ ...settings, schedule: { ...settings.schedule, enabled: event.target.checked } }) })),
        h('div', { className: 'st-rule-scroll' }, h('table', { className: 'st-rule-table', 'aria-label': '监控时间安排' },
          h('thead', null, h('tr', null, ['执行时间（北京时间）', '检查频率', '操作'].map(label => h('th', { key: label, scope: 'col' }, label)))),
          h('tbody', null, settings.schedule.enabled ? settings.schedule.windows.map((window, index) => h('tr', { key: index },
            h('td', null, editing === index ? h('div', { className: 'st-rule-editor' },
              h('select', { 'aria-label': '时间段' + (index + 1) + '重复方式', value: window.repeat || 'daily', onChange: event => setWindow(index, 'repeat', event.target.value) }, Object.entries(repeatLabels).map(([id, label]) => h('option', { key: id, value: id }, label))),
              window.repeat && !['daily', 'weekdays'].includes(window.repeat) ? h('label', { className: 'st-rule-date' }, window.repeat === 'once' ? '执行日期' : '首次日期', h('input', { type: 'date', min: '1000-01-01', max: '9999-12-31', required: true, 'aria-label': '时间段' + (index + 1) + '首次日期', value: window.date || '', onChange: event => setWindow(index, 'date', event.target.value) })) : null,
              h('span', { className: 'st-rule-time' },
              h('input', { type: 'time', required: true, 'aria-label': '时间段' + (index + 1) + '开始', value: window.start, onChange: event => setWindow(index, 'start', event.target.value) }), '至',
              h('input', { type: 'time', required: true, 'aria-label': '时间段' + (index + 1) + '结束', value: window.end, onChange: event => setWindow(index, 'end', event.target.value) }))) : h('span', { className: 'st-rule-description' }, repeatText(window), h('small', null, window.start + '–' + window.end))),
            h('td', null, editing === index ? number(window.intervalMinutes, '时间段' + (index + 1) + '间隔分钟', value => setWindow(index, 'intervalMinutes', value)) : intervalText(window.intervalMinutes * 60000) + '检查一次'),
            h('td', null, edit(index, '时间段' + (index + 1)), ' ', h('button', { type: 'button', 'aria-label': '删除时间段' + (index + 1), onClick: () => setSettings({ ...settings, schedule: { ...settings.schedule, windows: settings.schedule.windows.filter((_, i) => i !== index) } }) }, '删除')))) : null,
            h('tr', null, h('td', null, settings.schedule.enabled ? '其他时间' : '每天全天'),
              h('td', null, editing === 'default' ? number(settings.schedule.enabled ? settings.schedule.fallbackMinutes : settings.intervalMinutes, settings.schedule.enabled ? '其他时间间隔（分钟）' : '每隔多少分钟检查一次', value => setSettings(settings.schedule.enabled ? { ...settings, schedule: { ...settings.schedule, fallbackMinutes: value } } : { ...settings, intervalMinutes: value })) : intervalText((settings.schedule.enabled ? settings.schedule.fallbackMinutes : settings.intervalMinutes) * 60000) + '检查一次'), h('td', null, edit('default', settings.schedule.enabled ? '其他时间频率' : '全天频率')))))),
        settings.schedule.enabled && settings.schedule.windows.length < 12 ? h('button', { type: 'button', onClick: () => { setEditing(settings.schedule.windows.length); setSettings({ ...settings, schedule: { ...settings.schedule, windows: [...settings.schedule.windows, { start: '', end: '', intervalMinutes: '', repeat: 'weekdays' }] } }); } }, '+ 添加时间段') : null,
        h('small', { className: 'st-caption' }, settings.schedule.enabled ? '按北京时间固定刻度执行（60 分钟为整点）；其余时间使用最后一行的频率。重复规则从首次日期生效；每月或每年没有对应日期时跳过。' : '按北京时间固定刻度检查：60 分钟对齐整点，15 分钟对齐 00／15／30／45 分。实际读取受排队与连接状态影响。'));
    }

    function PostTimes({ publishedAt, detectedAt, savedAt, kind }) {
      return h('div', { className: 'st-event-times', title: '北京时间' },
        publishedAt ? h('span', null, '博主发布：', date(publishedAt)) : null,
        detectedAt ? h('span', null, kind === 'history' ? '缓存读取：' : kind === 'catchup' ? '恢复后补查：' : '监控发现：', date(detectedAt)) : savedAt ? h('span', { title: '旧记录未记录首次发现时间，此处是正文首次保存时间' }, '首次保存：', date(savedAt), '（旧记录）') : null);
    }
    function SettingRow({ label, description, htmlFor, children }) {
      return h('div', { className: 'st-setting-row' }, h('div', { className: 'st-setting-copy' }, htmlFor ? h('label', { htmlFor }, label) : h('span', null, label), description ? h('small', null, description) : null), h('div', { className: 'st-setting-control' }, children));
    }
    function IMSummary({ agent = {}, compact = false, onClick }) {
      const destinations = (agent.config ? pushDestinations(agent.config) : agent.destinations || []).map(item => ({
        ...item, ...agent.destinations?.find(row => row.botId === item.botId && row.targetId === item.targetId),
        state: !agent.transportAvailable ? 'unavailable' : !agent.config?.enabled || item.enabled === false ? 'paused' : agent.destinations?.find(row => row.botId === item.botId && row.targetId === item.targetId)?.state || 'checking',
      }));
      if (compact && onClick) {
        const channels = [...new Set(destinations.map(item => item.channel || 'IM'))];
        return h('div', { className: 'st-im-sidebar', 'aria-label': 'dsh-im 渠道状态' }, channels.length ? channels.map(channel => {
          const routes = destinations.filter(item => (item.channel || 'IM') === channel);
          const problem = routes.some(item => ['failed', 'invalid', 'unavailable'].includes(item.state));
          const paused = routes.every(item => item.state === 'paused');
          const checking = routes.some(item => item.state === 'checking');
          const label = problem ? '异常' : paused ? '已暂停' : checking ? '检查中' : '已连接';
          return h('button', { key: channel, type: 'button', className: 'st-sidebar-account', onClick, 'aria-label': '查看 dsh-im ' + (channelNames[channel] || channel) + '配置', title: '查看此渠道的配置与发送记录' },
            h('span', { className: 'st-dot ' + (problem ? 'failed' : paused || checking ? 'paused' : 'ready') }), h('span', null, 'dsh-im · ', channelNames[channel] || channel, ' · ', label));
        }) : h('button', { type: 'button', className: 'st-sidebar-account', onClick, 'aria-label': '查看 dsh-im 配置' }, h('span', { className: 'st-dot paused' }), 'dsh-im · 未配置'));
      }
      const failed = !!agent.integration?.error || destinations.some(item => ['failed', 'invalid'].includes(item.state));
      const active = destinations.filter(item => !['paused', 'unavailable'].includes(item.state)).length;
      const headline = !agent.transportAvailable ? '未接入 dsh-im' : agent.integration?.error ? 'dsh-im 配置读取失败' : failed ? '推送需处理' : active ? active + ' 个推送目标已开启' : destinations.length ? '推送已暂停' : '尚未添加推送渠道';
      return h('div', { className: 'st-im-summary' + (failed ? ' warning' : '') },
        h('strong', null, 'dsh-im'), h('span', null, headline),
        destinations.map(item => h('div', { className: 'st-im-route', key: item.botId + ':' + item.targetId }, h('span', null, channelNames[item.channel] || item.channel || 'IM', ' · ', item.name || item.targetId), h('b', { className: item.state, title: '发送成功表示平台已接受，不代表接收人已读' }, pushLabels[item.state] || '待检查'))));
    }
    function UpdateDialog({ initial, onStatus, close }) {
      const dialog = React.useRef(null), alive = React.useRef(true);
      const [view, setView] = React.useState(initial || {}), [checking, setChecking] = React.useState(false), [message, setMessage] = React.useState('');
      const [pending, setPending] = React.useState(() => {
        try { const value = JSON.parse(localStorage.getItem(NAME + ':update-pending')); return value && Date.now() - value.at < 86400000 ? value.version : ''; } catch { return ''; }
      });
      const remember = version => { try { if (version) localStorage.setItem(NAME + ':update-pending', JSON.stringify({ version, at: Date.now() })); else localStorage.removeItem(NAME + ':update-pending'); } catch {} };
      const accept = next => { if (next && alive.current) { setView(next); onStatus(next); } };
      const check = async fresh => {
        setChecking(true); setMessage('');
        try { accept((await api('/update' + (fresh ? '?fresh=1' : ''), undefined, AbortSignal.timeout(12000))).update); }
        catch { if (alive.current) setMessage('暂时无法检查更新，请检查网络或稍后重试。'); }
        finally { if (alive.current) setChecking(false); }
      };
      React.useEffect(() => { alive.current = true; dialog.current?.showModal(); void check(false); return () => { alive.current = false; }; }, []);
      React.useEffect(() => {
        if (!pending) return;
        let active = true, running = false;
        const deadline = Date.now() + 120000;
        const poll = async () => {
          if (running || !active) return;
          if (Date.now() > deadline) { setMessage('尚未确认更新结果，请重新打开插件查看当前版本；未再次发起安装。'); setPending(''); return; }
          running = true;
          try {
            const next = (await api('/update/state', undefined, AbortSignal.timeout(8000))).update;
            if (!active || !next) return;
            accept(next);
            if (next.currentVersion === pending) { remember(''); setPending(''); setMessage('已更新至 v' + pending); }
            else if (next.phase === 'overridden') { setPending(''); setMessage('安装已完成，但当前环境存在插件覆盖配置，请在 Harness 插件管理中确认生效版本。'); }
            else if (['complete', 'restart-required'].includes(next.phase)) { setPending(''); setMessage('新版 v' + next.result.updatedVersion + ' 已安装，请重新打开 Harness 生效。'); }
            else if (next.phase === 'failed') { remember(''); setPending(''); }
          } catch { /* The plugin route can briefly disappear while Harness replaces it. */ }
          finally { running = false; }
        };
        void poll();
        const timer = setInterval(poll, 1000);
        return () => { active = false; clearInterval(timer); };
      }, [pending]);
      const updating = !!pending || view.phase === 'applying';
      const finished = ['complete', 'restart-required', 'overridden'].includes(view.phase);
      const install = async () => {
        remember(view.latestVersion); setPending(view.latestVersion); setMessage('');
        try {
          const response = await api('/update', { version: view.latestVersion }, AbortSignal.timeout(15000));
          accept(response.update);
        } catch (error) { if (!alive.current) return; if (error.status >= 400 && error.status < 500) { remember(''); setPending(''); setMessage(error.message); } else setMessage('更新请求暂未确认，正在检查结果；不会重复安装。'); }
      };
      const status = updating ? '正在更新，界面可能短暂重新加载…' : view.error || message || (checking ? '正在检查最新版本…' : view.checkFailed ? '暂未取得最新版本：插件可能尚未发布，或网络连接异常。' : view.updateAvailable ? '有新版本 v' + view.latestVersion + ' 可用' : view.checkedAt ? '当前已是最新版本' : '点击检查获取最新版本');
      return h('dialog', { ref: dialog, className: 'st-node-dialog st-update-dialog', 'aria-label': '版本更新', onCancel: close },
        h('div', { className: 'st-dialog-head' }, h('h2', null, '版本更新'), h('button', { className: 'st-dialog-close', 'aria-label': '关闭版本更新', onClick: close }, '×')),
        h('div', { className: 'st-version-compare' }, h('div', null, h('small', null, '当前版本'), h('strong', null, view.currentVersion || '读取中')), h('span', { 'aria-hidden': true }, '→'), h('div', null, h('small', null, '最新版本'), h('strong', null, view.latestVersion || '暂未获取'))),
        h('p', { className: 'st-update-status', role: 'status' }, status),
        !view.canApply && view.updateAvailable ? h('p', { className: 'st-caption' }, ['link', 'file', 'workspace'].includes(view.installKind) ? '当前为本地源码安装，请手动更新源码，或通过 npm 安装后使用一键更新。' : '当前 Harness 未提供一键更新能力，可使用下方命令。') : null,
        h('div', { className: 'st-actions' }, h('button', { disabled: checking || updating, onClick: () => check(true) }, '立即检查'),
          h('button', { className: 'st-primary', disabled: checking || updating || finished || !view.canApply || !view.updateAvailable || view.checkFailed, onClick: install }, updating ? '更新中…' : '一键更新'),
          view.homepage ? h('a', { href: view.homepage, target: '_blank', rel: 'noreferrer' }, '项目主页 ↗') : null),
        h('p', { className: 'st-caption' }, '更新保留本地资料、账号授权和监控配置。需要重启时会提示，不会自动重启 Harness。'),
        view.manualCommand ? h('details', { className: 'st-update-command' }, h('summary', null, '手动更新命令'), h('code', null, view.manualCommand)) : null);
    }
    function AgentSettings({ state, act, busy, error, close, initialTab = 'settings' }) {
      const dialog = React.useRef(null), status = state.agent || {};
      const saved = status.config || { enabled: false, botId: '', targetId: '', uids: [] };
      const destinations = pushDestinations(saved);
      const [value, setValue] = React.useState({ ...saved, botId: saved.botId || '', targetId: saved.targetId || '' });
      const [all, setAll] = React.useState(!saved.uids.length);
      const [bots, setBots] = React.useState([]), [targets, setTargets] = React.useState([]);
      const [localError, setLocalError] = React.useState(''), [message, setMessage] = React.useState('');
      const [tab, setTab] = React.useState(initialTab);
      const [pushEnabled, setPushEnabled] = React.useState(saved.enabled);
      const [routeStates, setRouteStates] = React.useState({});
      const routeOn = item => routeStates[item.botId + ':' + item.targetId] ?? (saved.enabled && item.enabled !== false);
      const loadBots = () => api('/agent/bots').then(result => { setBots(result.items); setLocalError(''); }).catch(err => setLocalError(err.message));
      React.useEffect(() => { dialog.current?.showModal(); void loadBots(); }, []);
      React.useEffect(() => { setPushEnabled(saved.enabled); }, [saved.enabled]);
      React.useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
      React.useEffect(() => {
        let active = true;
        setTargets([]);
        if (value.botId && status.transportAvailable) void api('/agent/targets?botId=' + encodeURIComponent(value.botId)).then(result => { if (active) setTargets(result.items); }).catch(err => { if (active) setLocalError(err.message); });
        return () => { active = false; };
      }, [value.botId, status.transportAvailable]);
      const destinationChanged = !destinations.some(item => item.botId === value.botId && item.targetId === value.targetId);
      const pushRequirement = !status.transportAvailable ? '尚未连接 dsh-im，请检查机器人插件后刷新。' : !destinations.some(item => item.enabled !== false) ? '请先选择并保存接收目标。' : '';
      const save = async (config, text) => {
        setMessage(''); setLocalError('');
        const success = await act('/agent/settings', config);
        if (success) setMessage(text);
        return success;
      };
      const refresh = () => {
        void loadBots();
        if (value.botId && status.transportAvailable) void api('/agent/targets?botId=' + encodeURIComponent(value.botId)).then(result => setTargets(result.items)).catch(err => setLocalError(err.message));
      };
      const labels = { queued: '待发送', sending: '发送中', sent: '平台已接受', failed: '未发送', uncertain: '结果未知', cancelled: '已取消' };
      return h('dialog', { ref: dialog, className: 'st-node-dialog st-agent-dialog', 'aria-label': 'Social Trace Agent 设置', onCancel: close },
        h('div', { className: 'st-dialog-head' }, h('h2', null, 'Social Trace Agent'), h('button', { className: 'st-dialog-close', 'aria-label': '关闭 Agent 设置', onClick: close }, '×')),
        h('div', { className: 'st-reader-tabs', role: 'tablist', 'aria-label': 'Agent 配置' }, [['settings', '已添加渠道'], ['add', '添加渠道'], ['deliveries', '投递记录']].map(([id, label]) => h('button', { key: id, id: 'st-agent-tab-' + id, role: 'tab', 'aria-selected': tab === id, 'aria-controls': 'st-agent-panel-' + id, onClick: () => { setTab(id); setLocalError(''); } }, label))),
        error || localError ? h('p', { className: 'st-inline-error', role: 'alert' }, error || localError) : null,
        message ? h('p', { className: 'st-dialog-status', role: 'status' }, message, h('small', null, ' · 3 秒后收起')) : null,
        tab === 'settings' ? h('section', { id: 'st-agent-panel-settings', role: 'tabpanel', 'aria-labelledby': 'st-agent-tab-settings' },
          h('section', { className: 'st-setting-group', 'aria-label': '接收目标' },
            h('div', { className: 'st-setting-group-head' }, h('h3', null, '推送渠道'), h('button', { type: 'button', disabled: busy, className: 'st-link-button', onClick: refresh }, '刷新机器人与目标')),
            destinations.length ? h('div', { className: 'st-destination-list' }, destinations.map((item, index) => h('div', { className: 'st-destination-row', key: item.botId + ':' + item.targetId },
              h('div', null, h('strong', null, channelNames[item.channel || status.destinations?.find(row => row.botId === item.botId)?.channel] || 'IM', ' · ', item.name || status.destinations?.find(row => row.botId === item.botId && row.targetId === item.targetId)?.name || item.targetId), h('small', null, pushLabels[status.destinations?.find(row => row.botId === item.botId && row.targetId === item.targetId)?.state] || '待检查', ' · 机器人 ', item.botId)),
              h('label', { className: 'st-setting-toggle' }, h('span', null, routeOn(item) ? '已开启' : '已暂停'), h('input', { type: 'checkbox', role: 'switch', 'aria-label': '推送目标' + (index + 1) + '开关', disabled: busy, checked: routeOn(item), onChange: event => {
                setRouteStates({ ...routeStates, [item.botId + ':' + item.targetId]: event.target.checked });
                const next = destinations.map((row, i) => i === index ? { ...row, enabled: event.target.checked } : row);
                void save({ enabled: event.target.checked || saved.enabled && next.some(row => row.enabled !== false), uids: saved.uids, destinations: next }, '推送渠道已保存').then(() => setRouteStates({}));
              } })),
              h('button', { type: 'button', disabled: busy, 'aria-label': '移除推送目标' + (index + 1), onClick: () => {
                const next = destinations.filter((_, i) => i !== index);
                void save({ enabled: saved.enabled && next.some(row => row.enabled !== false), uids: saved.uids, destinations: next }, '推送目标已移除');
              } }, '移除')))) : h('div', { className: 'st-empty' }, h('h3', null, '还没有添加推送渠道'), h('button', { type: 'button', onClick: () => setTab('add') }, '添加第一个渠道')),
            h('p', { className: 'st-caption' }, '添加接收目标后，新动态会同时发送到所有已开启的渠道。'),
          ),
          h('section', { className: 'st-setting-group', 'aria-label': '推送规则' }, h('h3', null, '推送规则'),
            h(SettingRow, { label: '自动推送', htmlFor: 'st-agent-enabled', description: pushRequirement || '新动态和平台连接异常会提醒；历史缓存不推送'  },
              h('label', { className: 'st-setting-toggle' }, h('span', null, pushEnabled ? '已开启' : '已关闭'), h('input', { id: 'st-agent-enabled', type: 'checkbox', role: 'switch', 'aria-label': '自动推送新动态', checked: pushEnabled, disabled: busy, onChange: event => {
                if (event.target.checked && pushRequirement) { setLocalError(pushRequirement); dialog.current?.querySelector(!saved.botId ? '#st-agent-bot' : '#st-agent-target')?.focus(); return; }
                const enabled = event.target.checked;
                setPushEnabled(enabled);
                void save({ ...saved, enabled }, enabled ? '自动推送已开启' : '自动推送已关闭').then(success => { if (!success) setPushEnabled(saved.enabled); });
              } }))),
            h(SettingRow, { label: '推送博主', htmlFor: 'st-agent-scope', description: '只改变推送范围，不改变监控和缓存' },
              h('select', { id: 'st-agent-scope', 'aria-label': '推送博主范围', disabled: busy, value: all ? 'all' : 'selected', onChange: event => { setAll(event.target.value === 'all'); if (event.target.value === 'selected' && !value.uids.length) setValue({ ...value, uids: state.targets.map(target => target.uid) }); } }, h('option', { value: 'all' }, '全部博主（含以后新增）'), h('option', { value: 'selected' }, '指定博主'))),
            !all ? h('div', { className: 'st-agent-authors' }, state.targets.map(target => h('label', { key: target.uid, className: 'st-agent-check' }, h('input', { type: 'checkbox', checked: value.uids.includes(target.uid), disabled: busy, onChange: event => setValue({ ...value, uids: event.target.checked ? [...value.uids, target.uid] : value.uids.filter(uid => uid !== target.uid) }) }), target.name))) : null,
            h('div', { className: 'st-setting-actions' }, h('button', { type: 'button', disabled: busy || all === !saved.uids.length && (all || JSON.stringify(value.uids) === JSON.stringify(saved.uids)), onClick: () => {
              if (!all && !value.uids.length) { setLocalError('请至少选择一位博主'); return; }
              void save({ ...saved, uids: all ? [] : value.uids }, '推送博主范围已保存');
            } }, '保存博主范围'))),
          h('details', { className: 'st-setting-help' }, h('summary', null, 'AI 总结与按需问答 · 开发中'), h('p', { className: 'st-caption' }, '尚未接入模型与 Agent 执行，不会自动生成总结。当前推送为原文通知。')))
        : tab === 'add' ? h('section', { id: 'st-agent-panel-add', role: 'tabpanel', 'aria-labelledby': 'st-agent-tab-add', className: 'st-add-channel' },
          h('p', { className: 'st-caption' }, '选择 dsh-im 中的机器人和接收目标，将它添加到 Social Trace。'),
            h(SettingRow, { label: '机器人', htmlFor: 'st-agent-bot', description: status.transportAvailable ? '复用 dsh-im 已连接的机器人' : '尚未连接 dsh-im' },
              h('select', { id: 'st-agent-bot', 'aria-label': '推送机器人', value: value.botId, disabled: busy, onChange: event => setValue({ ...value, botId: event.target.value, targetId: '' }) },
                h('option', { value: '' }, '请选择机器人'), value.botId && !bots.some(bot => bot.botId === value.botId) ? h('option', { value: value.botId }, '已保存：' + value.botId) : null,
                bots.map(bot => h('option', { key: bot.botId, value: bot.botId }, (channelNames[bot.channel] || bot.channel) + ' · ' + bot.botId.slice(-8))))),
            h(SettingRow, { label: '接收目标', htmlFor: 'st-agent-target', description: '微信仅支持个人，其他渠道以机器人能力为准' },
              h('select', { id: 'st-agent-target', 'aria-label': '推送接收目标', value: value.targetId, disabled: busy || !value.botId, onChange: event => setValue({ ...value, targetId: event.target.value }) },
                h('option', { value: '' }, '请选择接收目标'), value.targetId && !targets.some(target => target.targetId === value.targetId) ? h('option', { value: value.targetId }, '已保存：' + value.targetId) : null,
                targets.map(target => h('option', { key: target.targetId, value: target.targetId }, target.name || target.targetId)))),
            h('div', { className: 'st-setting-actions' }, null,
              h('button', { type: 'button', disabled: busy || !value.botId || !value.targetId || !destinationChanged, onClick: async () => { if (await save({ enabled: saved.enabled, uids: saved.uids, destinations: [...destinations, { botId: value.botId, targetId: value.targetId, enabled: true }] }, '接收目标已添加')) { setTab('settings'); setValue({ ...value, botId: '', targetId: '' }); } } }, '保存接收目标'),
              h('button', { type: 'button', disabled: busy || !status.transportAvailable || !value.botId || !value.targetId, onClick: async () => {
                setLocalError(''); setMessage('');
                if (await act('/agent/test', { botId: value.botId, targetId: value.targetId, uids: saved.uids })) setMessage('dsh-im 已接受测试消息，请到所选聊天查看');
              } }, '发送一条测试消息')),
          h('details', { className: 'st-setting-help', open: !destinations.length }, h('summary', null, '如何配置接收目标'),
            h('ol', { className: 'st-agent-guide' }, h('li', null, '用接收消息的账号给机器人发一条消息。'), h('li', null, '打开 dsh-im 机器人卡片「更多设置 → 投递设置 → 新建目标」，从「已聊过的会话」选择，创建并保存接收目标。'), h('li', null, '回到这里刷新，选择并保存接收目标，再开启自动推送。')),
            h('p', { className: 'st-caption' }, '微信仅支持个人接收人，不支持群；发送依赖对应用户的消息上下文。'),
            h('a', { href: 'https://github.com/xmanrui/dsh-im/blob/main/PROACTIVE_DELIVERY.md', target: '_blank', rel: 'noreferrer', className: 'st-link-button' }, '查看 dsh-im 配置指引 ↗'))
        )
        : h('section', { id: 'st-agent-panel-deliveries', role: 'tabpanel', 'aria-labelledby': 'st-agent-tab-deliveries' },
          h('p', { className: 'st-caption' }, '最近 30 条。平台接受不等于客户已读；失败或结果未知不会自动重发。'),
          status.deliveries?.length ? h('div', { className: 'st-agent-delivery-scroll' }, h('table', { className: 'st-agent-deliveries' }, h('thead', null, h('tr', null, ['内容 / 接收渠道', '状态', '时间（北京时间）'].map(text => h('th', { key: text, scope: 'col' }, text)))), h('tbody', null, status.deliveries.map(row => h('tr', { key: row.id }, h('td', null, row.author, h('small', null, (() => { const item = status.destinations?.find(item => item.botId === row.bot_id && item.targetId === row.target_id); return (channelNames[item?.channel] || item?.channel || 'IM') + ' · ' + (item?.name || row.target_id || '原接收目标'); })())), h('td', null, h('span', { className: 'st-delivery-state ' + row.status }, labels[row.status] || row.status), row.error ? h('small', null, row.error === 'delivery-failed' ? 'dsh-im 插件发送失败，未确认是否送达。请检查 dsh-im 的机器人连接与接收目标；微信接收人可先给机器人发一条消息，再主动测试。' : row.error) : null), h('td', null, h(PostTimes, { publishedAt: row.published_at, detectedAt: row.detected_at, savedAt: row.saved_at }), h('div', null, row.sent_at ? '平台接受：' : row.finished_at ? '发送结果：' : '入队：', date(row.sent_at || row.finished_at || row.created_at)))))))) : h('div', { className: 'st-empty' }, h('h3', null, '暂无投递记录'), h('p', null, '开启推送后，新采集的动态会显示在这里。'))));
    }
    function AddAuthorDialog({ state, act, busy, error, close, connect, initialPlatform = 'weibo', clearError = () => {} }) {
      const dialog = React.useRef(null), [url, setUrl] = React.useState('');
      const [selectedPlatform, setSelectedPlatform] = React.useState(['weibo', 'xueqiu'].includes(initialPlatform) ? initialPlatform : 'weibo');
      const name = platformNames[selectedPlatform], connected = platformAccount(state, selectedPlatform)?.status === 'ready';
      React.useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector('input')?.focus(); }, []);
      return h('dialog', { ref: dialog, className: 'st-node-dialog', 'aria-label': '添加' + name + '博主', onCancel: close },
        h('div', { className: 'st-dialog-head' }, h('h2', null, '添加' + name + '博主'), h('button', { className: 'st-dialog-close', 'aria-label': '关闭添加博主', onClick: close }, '×')),
        h('div', { className: 'st-platform-tabs', role: 'tablist', 'aria-label': '添加博主的平台' }, ['weibo', 'xueqiu'].map(id => h('button', { key: id, role: 'tab', 'aria-selected': selectedPlatform === id, onClick: () => { setSelectedPlatform(id); setUrl(''); clearError(); } }, platformNames[id]))),
        !connected ? h('div', null, h('p', null, '先连接你的' + name + '账号，再读取要关注的博主。'), h('button', { className: 'st-primary', onClick: () => connect(selectedPlatform) }, '去连接' + name))
        : h('form', { onSubmit: async event => { event.preventDefault(); if (await act('/targets', { platform: selectedPlatform, url })) close(); } },
          h('label', null, '博主主页链接或数字 UID', h('input', { 'aria-label': name + '博主主页或 UID', value: url, required: true, placeholder: selectedPlatform === 'weibo' ? 'https://weibo.com/u/…' : 'https://xueqiu.com/u/…', onChange: event => { setUrl(event.target.value); clearError(); } })),
          h('p', { className: 'st-caption' }, '先读取昵称、头像和消息总数，再由你决定从现在记录，还是缓存以前的消息。'),
          error ? h('p', { className: 'st-inline-error', role: 'alert' }, error) : null,
          h('button', { className: 'st-primary', disabled: busy }, busy ? '正在添加…' : '添加并读取资料')));
    }
    function NodeSettings({ context, state, act, busy, error, navigate, close, openSettings, embedded = false }) {
      const dialog = React.useRef(null);
      const target = state.targets.find(item => item.uid === context.uid), source = state.platforms?.find(item => item.id === context.platform);
      const [value, setValue] = React.useState(() => ({ intervalMinutes: (target?.policy?.intervalMs || target?.interval_ms || source?.targetDefaults?.intervalMs || 900000) / 60000,
        historyGapSeconds: (source?.targetDefaults?.historyGapMs || 60000) / 1000,
        schedule: target?.policy?.schedule || source?.schedule || { enabled: false, fallbackMinutes: 60, windows: [] } }));
      const [range, setRange] = React.useState(() => target ? rangeValue(target) : presetRange('all'));
      const [originalOnly, setOriginalOnly] = React.useState(target?.historyOriginalOnly === true);
      const [tab, setTab] = React.useState(context.tab || 'frequency');
      const [message, setMessage] = React.useState('');
      const owners = target ? [target] : state.targets.filter(item => item.platform === context.platform && item.capture_mode !== 'pending');
      const history = state.jobs.filter(job => job.kind === 'history' && owners.some(item => item.uid === job.uid));
      const independent = state.targets.filter(item => item.platform === context.platform && item.policy);
      const paused = state.enabled === false || source?.enabled === false;
      const unchanged = owners.every(owner => range.from === day(owner.history_from) && range.to === day(owner.history_to) && originalOnly === (owner.historyOriginalOnly === true));
      const complete = history.length === owners.length && history.length > 0 && history.every(job => job.status === 'complete') && unchanged;
      const scheduled = owners.every(owner => owner.enabled !== false) && unchanged && history.length === owners.length && history.length > 0 && history.every(job => ['queued', 'complete'].includes(job.status));
      const running = owners.some(owner => streamStatus(state, owner, 'history') === '缓存中');
      const started = history.some(job => job.pages > 0 || job.pending > 0 || job.page > 1) || owners.some(owner => owner.capture_mode === 'history' || progressFor(state, owner.uid).history.started);
      const progress = target && progressFor(state, target.uid);
      const problems = state.jobs.filter(job => job.status === 'needs_review' && job.kind === (tab === 'history' ? 'history' : 'updates') && owners.some(owner => owner.uid === job.uid));
      const run = async (path, body, message) => { if (await act(path, { platform: context.platform, ...body })) { setMessage(message); return true; } return false; };
      React.useEffect(() => { if (!embedded) dialog.current?.showModal(); }, []);
      return h(embedded ? 'section' : 'dialog', { ref: embedded ? undefined : dialog, className: embedded ? 'st-inline-settings' : 'st-node-dialog', role: embedded ? 'region' : undefined, 'aria-label': '节点监控设置', onCancel: embedded ? undefined : close },
        !embedded ? h('div', { className: 'st-dialog-head' }, h('h2', null, target ? target.name + '的监控设置' : context.scope === 'all' ? '平台默认监控设置' : platformNames[context.platform] + '监控设置'), h('button', { className: 'st-dialog-close', 'aria-label': '关闭监控设置', onClick: close }, '×')) : null,
        !embedded ? h('p', { className: 'st-caption' }, target ? '只影响这位博主。' : tab === 'frequency' ? '这是平台默认频率。只有跟随平台设置的博主会更新，单独设置的博主保持不变。' : '批量管理博主的历史缓存，不改变各博主的监控频率。') : null,
        !['weibo', 'xueqiu'].includes(context.platform) ? h('p', null, '开发中') : h(React.Fragment, null,
          error ? h('p', { className: 'st-inline-error', role: 'alert' }, error) : null,
          message ? h('p', { className: 'st-dialog-status', role: 'status' }, message) : null,
          !embedded ? h('div', { className: 'st-platform-tabs', role: 'tablist', 'aria-label': '节点配置' }, [['frequency', '新动态监控'], ['history', '历史消息缓存']].map(([id, label]) =>
            h('button', { key: id, id: 'st-node-tab-' + id, role: 'tab', 'aria-selected': tab === id, 'aria-controls': 'st-node-panel-' + id, onClick: () => { setTab(id); setMessage(''); } }, label))) : null,
          problems.map(job => h('p', { key: job.id, className: 'st-inline-error', role: 'alert' }, h('strong', null, owners.find(owner => owner.uid === job.uid)?.name || job.uid), ' · ', taskProblem(job), ' ', h('button', { disabled: busy, onClick: () => act('/jobs/' + job.id + '/resume') }, job.kind === 'history' ? '重试历史缓存' : '重试新动态监控'))),
          tab === 'frequency' && progress?.catchup ? h('p', { className: 'st-caption', role: 'status' }, streamStatus(state, target, 'updates') === '补查中' ? '正在补查离线期间的动态：从 ' : '离线补查' + streamStatus(state, target, 'updates') + '：从 ', date(progress.catchup.from), ' 比对，第 ', progress.catchup.page, ' 页，已补存 ', progress.catchup.saved, ' 条。完成后恢复设定频率。') : null,
          tab === 'frequency' ? h('form', { id: 'st-node-panel-frequency', role: 'tabpanel', 'aria-labelledby': embedded ? 'st-reader-tab-frequency' : 'st-node-tab-frequency', onSubmit: event => { event.preventDefault(); void run(target ? '/targets/policy' : '/settings', target ? { uid: target.uid, inherit: false, intervalMinutes: value.intervalMinutes, schedule: value.schedule } : { intervalMinutes: value.intervalMinutes, schedule: value.schedule }, '监控时间与频率已保存'); } },
            target ? h('p', { className: 'st-caption' }, target.policy ? '当前为这位博主单独设置。' : '已填入' + platformNames[context.platform] + '平台的时间；保存后只对这位博主生效。') : null,
            target ? h(TaskControl, { state, target, kind: 'updates', act, busy, openSettings: context => { setTab(context.tab || 'frequency'); } }) : null,
            h(FrequencyFields, { value, change: setValue, disabled: busy }),

            !target ? h('section', { className: 'st-independent', 'aria-label': '独立时间配置的博主' }, h('h3', null, '独立时间配置', independent.length ? ' · ' + independent.length + ' 位' : ''),
              independent.length ? h('div', { className: 'st-independent-list' }, independent.map(item => h('div', { key: item.uid },
                h('strong', null, item.name), h('small', null, item.policy.schedule?.enabled ? item.policy.schedule.windows.map(window => repeatText(window) + ' ' + window.start + '–' + window.end + ' 每' + window.intervalMinutes + '分钟').concat('其他时间每' + item.policy.schedule.fallbackMinutes + '分钟').join('；') : intervalText(item.policy.intervalMs) + '检查一次'),
                h('button', { type: 'button', className: 'st-link-button', 'aria-label': '查看' + item.name + '的独立配置', onClick: () => openSettings({ scope: 'target', uid: item.uid, platform: item.platform, tab: 'frequency' }) }, '详细设置 →'))))
                : h('p', { className: 'st-caption' }, '所有博主均跟随平台默认频率。')) : null,
            target?.policy ? h('button', { type: 'button', disabled: busy, onClick: async () => {
              if (await run('/targets/policy', { uid: target.uid, inherit: true }, '已恢复平台统一设置')) setValue({ intervalMinutes: (source?.targetDefaults?.intervalMs || 900000) / 60000, schedule: source?.schedule || { enabled: false, fallbackMinutes: 60, windows: [] } });
            } }, '恢复平台统一设置') : null,
            h('button', { className: 'st-primary', disabled: busy }, '保存监控时间')) : null,
          tab === 'history' ? h('section', { id: 'st-node-panel-history', role: 'tabpanel', 'aria-labelledby': embedded ? 'st-reader-tab-history' : 'st-node-tab-history', className: 'st-history-panel' },
            target?.capture_mode === 'pending' && (!target.profile_checked_at || platformAccount(state, context.platform)?.status !== 'ready') ? h('div', null, h('p', null, '先连接' + platformNames[context.platform] + '并读取博主资料。'), h('button', { onClick: () => { close(); navigate('archive', { uid: target.uid }); } }, '去完成博主设置'))
            : h(React.Fragment, null,
              h('p', { className: 'st-history-state' }, '历史消息：', target ? streamStatus(state, target, 'history') : running ? '缓存中' : history.some(job => job.status === 'queued') ? '等待执行' : complete ? '已完成' : '已暂停'),
              h('p', { className: 'st-visibility-note' }, '只能缓存当前登录账号可见的消息。已删除或当前账号无权查看的消息无法缓存。'),
              target && progress ? h('dl', { className: 'st-cache-facts' },
                h('div', null, h('dt', null, '博主消息总数（含转发）'), h('dd', null, totalText(progress.history))),
                h('div', null, h('dt', null, '本地累计（新＋历史）'), h('dd', null, progress.saved.toLocaleString(), ' 条')),
                progress.history.originalOnly ? h('div', null, h('dt', null, '所选范围内原创已存'), h('dd', null, (progress.history.rangeSaved || 0).toLocaleString(), ' 条')) : null,
                h('div', null, h('dt', null, '预计剩余'), h('dd', null, progress.history.originalOnly ? '原创总数未知，无法估算' : typeof progress.history.estimatedRemaining === 'number' ? progress.history.estimatedRemaining.toLocaleString() + ' 条' : progress.history.status === 'complete' ? '可见范围已缓存' : '暂时无法估算')),
                h('div', null, h('dt', null, '最近保存'), h('dd', null, progress.lastSavedAt ? date(progress.lastSavedAt) : '尚未保存'))) : null,
              h('p', { className: 'st-caption' }, target ? '筛选只影响历史缓存，已存消息保留；新动态监控不受影响。' : '应用到已完成设置的 ' + owners.length + ' 位博主；已保存的消息不会删除。'),
              context.platform === 'xueqiu' ? h('p', { className: 'st-caption' }, '雪球文章只保留标题和原文链接，不下载文章正文。') : null,
              h(SettingRow, { label: '缓存时间', description: '只缓存当前账号可见的消息' }, h(RangePicker, { value: range, change: setRange, disabled: busy, label: '缓存消息时间范围' })),
              !target ? h('form', { className: 'st-history-pace', onSubmit: event => { event.preventDefault(); void run('/settings/history', { historyGapSeconds: value.historyGapSeconds }, '历史缓存速度已保存'); } },
                h(SettingRow, { label: '缓存速度', htmlFor: 'st-history-pace', description: '每页读取后的等待秒数，不影响新动态频率' }, h('input', { id: 'st-history-pace', type: 'number', min: 60, max: 86400, required: true, 'aria-label': '历史缓存每页等待秒数', value: value.historyGapSeconds, disabled: busy, onChange: event => setValue({ ...value, historyGapSeconds: Number(event.target.value) }) })),
                h('button', { type: 'submit', disabled: busy }, '保存缓存速度')) : null,
              h('label', { className: 'st-original-only' }, h('span', null, '仅缓存原创（不含转发）'), h('input', { type: 'checkbox', role: 'switch', checked: originalOnly, disabled: busy, onChange: event => setOriginalOnly(event.target.checked) })),
              paused ? h('p', { className: 'st-caption' }, '监控开关已暂停，安排的缓存会在恢复后执行。') : null,
              h('div', { className: 'st-actions', style: { marginTop: 14 } },
                !complete && !scheduled ? h('button', { className: 'st-primary', disabled: busy || !owners.length, onClick: () => run(target?.capture_mode === 'pending' ? '/targets/start' : '/history/range', { uid: target?.uid, mode: 'history', scope: target ? 'target' : 'platform', from: range.from, to: range.to, originalOnly, enableTarget: !!target }, paused ? '已安排缓存，恢复监控开关后执行' : '缓存任务已更新') }, target?.capture_mode === 'pending' ? '确认并开始记录' : !unchanged ? '应用筛选并缓存' : started ? '继续缓存' : '开始缓存') : null,
                complete ? h('span', { className: 'st-caption' }, '所选可见消息已缓存；更改筛选后可重新缓存。') : null,
                history.some(job => job.status === 'queued') ? h('button', { className: scheduled ? 'st-primary' : '', disabled: busy, onClick: () => run('/history/pause', { uid: target?.uid, scope: target ? 'target' : 'platform' }, '以前消息的缓存已暂停，进度保留') }, '暂停缓存') : null))) : null));
    }
    function TaskControl({ state, target, kind, act, busy, openSettings }) {
      const job = state.jobs.find(item => item.uid === target.uid && item.kind === kind);
      const enabled = target.enabled !== false && job?.status === 'queued';
      const status = target.capture_mode === 'pending' ? '未开启' : enabled && state.enabled === false ? '等待总控' : enabled && state.platforms?.find(item => item.id === target.platform)?.enabled === false ? '等待平台' : streamStatus(state, target, kind);
      const running = ['监控中', '缓存中', '补查中'].includes(status);
      const label = kind === 'history' ? '历史缓存' : '新动态';
      const toggle = async () => {
        if (!job || job.status === 'complete') return openSettings({ scope: 'target', uid: target.uid, platform: target.platform, tab: kind === 'history' ? 'history' : 'frequency' });
        if (target.capture_mode === 'pending') {
          if (!target.profile_checked_at && !await act('/targets/profile', { uid: target.uid, platform: target.platform, interactive: true })) return;
          await act('/targets/start', { uid: target.uid, platform: target.platform, mode: kind === 'history' ? 'history' : 'from_now', kind, from: target.history_from ? day(target.history_from) : null, to: target.history_to ? day(target.history_to) : null, originalOnly: target.historyOriginalOnly === true });
        } else await act('/jobs/' + job.id + '/' + (enabled ? 'pause' : 'resume'), { platform: target.platform, enableTarget: !enabled });
      };
      return h('div', { className: 'st-task-control' }, h('span', { className: 'st-task-label' }, kind === 'history' ? '历史缓存' : '新动态'),
        h('button', { type: 'button', role: 'switch', 'aria-label': target.name + label + '开关', 'aria-checked': enabled, disabled: busy, onClick: toggle, className: 'st-state-pill' + (running ? ' running' : ''), title: label + '：' + status + '；点击' + (enabled ? '暂停' : '开启') },
          h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': true, fill: 'currentColor' },
            running ? h('path', { d: 'M4 2l9 6-9 6z' }) : status === '已完成' ? h('path', { d: 'm2 8 4 4 8-9 1 1-9 10-5-5z' }) : h('path', { d: 'M4 3h3v10H4zm5 0h3v10H9z' })), status));
    }
    function AuthorProgress({ state, target }) {
      const progress = progressFor(state, target.uid);
      const field = (label, value) => h('div', null, h('dt', null, label), h('dd', null, value));
      return h('section', { className: 'st-author-progress', 'aria-label': target.name + '保存进度' },
        h('dl', { className: 'st-save-facts st-reader-facts' }, field('消息总数（含转发）', totalText(progress.history)), field('本地已存', progress.saved.toLocaleString() + ' 条'), field('最近保存', progress.lastSavedAt ? date(progress.lastSavedAt) : '尚未保存')));
    }

    function AuthorList({ state, act, busy, navigate, openSettings }) {
      const [sort, setSort] = React.useState({ key: '', ascending: false });
      const rows = state.targets.map(target => ({ target, progress: progressFor(state, target.uid) }));
      if (sort.key) rows.sort((a, b) => {
        const value = row => sort.key === 'saved' ? row.progress.saved : row.progress.history.reportedTotal;
        const x = value(a), y = value(b);
        if (typeof x !== 'number') return typeof y !== 'number' ? 0 : 1;
        if (typeof y !== 'number') return -1;
        return (x - y) * (sort.ascending ? 1 : -1);
      });
      const heading = (label, key) => h('th', { scope: 'col', 'aria-sort': sort.key === key ? sort.ascending ? 'ascending' : 'descending' : 'none' },
        h('button', { type: 'button', className: 'st-sort-heading', 'aria-label': '按' + label + '排序', onClick: () => setSort({ key, ascending: sort.key === key ? !sort.ascending : false }) }, label, h('span', { 'aria-hidden': true }, sort.key === key ? sort.ascending ? '↑' : '↓' : '↕')));
      return h('div', { className: 'st-author-table-scroll' }, h('table', { className: 'st-author-table', 'aria-label': '全部博主保存概况' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, '博主'), h('th', { scope: 'col' }, '平台'), heading('消息总数', 'total'), heading('已存', 'saved'),
          ['新动态', '历史缓存', '详细设置'].map(label => h('th', { key: label, scope: 'col' }, label)))),
        h('tbody', null, rows.map(({ target, progress }) => h('tr', { key: target.uid, className: 'st-author-overview' },
          h('td', null, h('button', { className: 'st-author-open', onClick: () => navigate('archive', { uid: target.uid }) }, h(AuthorAvatar, { target, size: 'small' }),
            h('span', null, h('strong', null, target.name), h('span', { className: 'st-meta-tag st-uid-tag' }, 'UID ' + (target.external_uid || target.uid))))),
          h('td', null, h('span', { className: 'st-meta-tag st-platform-badge' }, platformNames[target.platform || 'weibo'] || target.platform)),
          h('td', null, totalText(progress.history)), h('td', null, progress.saved.toLocaleString() + ' 条'),
          h('td', null, h(TaskControl, { state, target, kind: 'updates', act, busy, openSettings })),
          h('td', null, h(TaskControl, { state, target, kind: 'history', act, busy, openSettings })),
          h('td', null, target.capture_mode === 'pending' ? h('button', { className: 'st-primary', onClick: () => navigate('archive', { uid: target.uid }) }, '开始设置')
            : h('button', { className: 'st-link-button', onClick: () => openSettings({ scope: 'target', uid: target.uid, platform: target.platform }) }, '详细设置 →')))))));
    }

    function ImageGallery({ post, images, quoted = false }) {
      const [failed, setFailed] = React.useState({}), [loaded, setLoaded] = React.useState({}), [selected, setSelected] = React.useState(null);
      const dialog = React.useRef(null);
      React.useEffect(() => { if (selected !== null) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
      const source = index => `${BASE}/media?id=${encodeURIComponent(post.id)}&index=${index}&quote=${quoted ? 1 : 0}`;
      return !images?.length ? null : h(React.Fragment, null,
        h('div', { className: 'st-image-grid' }, images.map((url, index) => failed[index] ? h('a', { key: index, href: post.url, target: '_blank', rel: 'noreferrer', className: 'st-image-failed' }, '图片暂不可用 · 查看原文')
          : h('button', { key: index, type: 'button', 'aria-label': '查看配图 ' + (index + 1), onClick: () => setSelected(index) },
            !loaded[index] ? h('span', { className: 'st-image-loading' }, '图片加载中') : null,
            h('img', { onLoad: () => setLoaded(before => ({ ...before, [index]: true })), src: source(index), loading: 'lazy', alt: '动态配图 ' + (index + 1), onError: () => setFailed(before => ({ ...before, [index]: true })) })))),
        h('dialog', { className: 'st-lightbox', ref: dialog, onCancel: () => setSelected(null), onClick: event => { if (event.target === event.currentTarget) setSelected(null); } },
          h('button', { type: 'button', 'aria-label': '关闭大图', onClick: () => setSelected(null) }, '关闭 ×'),
          selected !== null ? h('img', { src: source(selected), alt: '动态配图大图' }) : null));
    }
    function QuoteBlock({ post }) {
      return !post.quote ? null : h('details', { className: 'st-quote' }, h('summary', null, h('strong', null, '@' + (post.quote.author || '原作者')), h('span', { className: 'st-quote-action' }),
        h('p', { className: 'st-quote-preview' }, post.quote.text.slice(0, 180))),
        h('div', { className: 'st-quote-body' }, post.quote.article ? h('a', { href: post.quote.url, target: '_blank', rel: 'noreferrer' }, post.quote.text.split('\n\n')[0] + ' ↗') : post.quote.text, h(ImageGallery, { post, images: post.quote.images, quoted: true })));
    }
    function FrequencyNote({ state, platform, uid = '', navigate }) {
      const source = state.platforms?.find(item => item.id === platform);
      const target = state.targets.find(item => item.uid === uid), schedule = target?.policy?.schedule || source?.schedule;
      const progress = state.progress?.find(row => row.uid === uid);
      const rules = schedule?.enabled ? '北京时间：' + schedule.windows.map(window => repeatText(window) + ' ' + window.start + '–' + window.end + ' ' + intervalText(window.intervalMinutes * 60000)).join('；') + '；其他时间 ' + intervalText(schedule.fallbackMinutes * 60000) : '固定频率';
      const change = uid && progress ? progress.nextChangeAt : source?.frequency?.nextChangeAt;
      return h('button', { type: 'button', className: 'st-frequency-note', 'aria-label': (uid ? '博主' : '平台') + '检查频率', title: rules + '。点击调整；检查时间可能受请求间隔和排队影响。',
        onClick: () => navigate('settings', { platform, section: 'frequency' }) },
        h('span', { className: 'st-frequency-value' }, uid ? '当前 · ' : '平台默认 · 当前 ', intervalText(checkInterval(state, platform, uid)), '检查', schedule?.enabled ? ' · 分时' : ''),
        change ? h('span', { className: 'st-frequency-change' }, '｜', chinaClock(change, false), ' 起 ', intervalText(uid && progress ? progress.nextIntervalMs : source.frequency.nextIntervalMs)) : null);
    }
    function FlowOverview({ state, uid, navigate, download, control, jobControl, openSettings, busy, acknowledge, openAgent, preview = false }) {
      const stage = React.useRef(null);
      const viewport = React.useRef(null), drag = React.useRef(null);
      const [zoom, setZoom] = React.useState(1);
      const [pan, setPan] = React.useState({ x: 0, y: 0 });
      const [canvas, setCanvas] = React.useState({ width: 1120, height: 590 });
      const [libraryPage, setLibraryPage] = React.useState(0);
      const libraryPages = Math.max(1, Math.ceil(state.targets.length / 6));
      const currentLibraryPage = Math.min(libraryPage, libraryPages - 1);
      const libraryItems = state.targets.slice(currentLibraryPage * 6, currentLibraryPage * 6 + 6);
      const previousSummaries = React.useRef(null);
      const [folds, setFolds] = React.useState(() => {
        const defaults = Object.fromEntries(state.targets.flatMap(item => [['author-' + item.uid, true], ['detail-' + item.uid, state.targets.length > 8], ['card-' + item.uid, state.targets.length > 8]]));
        let saved = {};
        try { saved = JSON.parse(localStorage.getItem(NAME + ':flow-folds' + (preview ? ':preview' : ''))) || {}; } catch {}
        return { ...defaults, ...saved, library: true, ...Object.fromEntries(state.targets.map(item => ['author-' + item.uid, true])) };
      });
      const [visible, setVisible] = React.useState(!document.hidden);
      const [savedPulse, setSavedPulse] = React.useState(null);
      const [wires, setWires] = React.useState([]);
      React.useLayoutEffect(() => { viewport.current?.firstElementChild?.scrollTo(0, 0); }, [pan, zoom]);
      React.useEffect(() => {
        const observer = new ResizeObserver(() => {
          const root = stage.current;
          if (root) setCanvas(before => {
            const width = Math.max(viewport.current.clientWidth, 1120), height = root.offsetHeight;
            return before.width === width && before.height === height ? before : { width, height };
          });
        });
        observer.observe(viewport.current); observer.observe(stage.current);
        return () => observer.disconnect();
      }, []);
      const changeZoom = (value, point) => {
        const root = viewport.current, next = Math.max(.05, Math.min(2, value));
        const x = point?.x ?? root.clientWidth / 2, y = point?.y ?? root.clientHeight / 2;
        const surface = root.firstElementChild;
        const left = (x - pan.x + surface.scrollLeft) / zoom, top = (y - pan.y + surface.scrollTop) / zoom;
        setZoom(next);
        setPan({ x: x - left * next, y: y - top * next });
      };
      const fitCanvas = () => {
        const root = viewport.current;
        const next = Math.max(.05, Math.min(1, root.clientWidth / canvas.width, root.clientHeight / canvas.height));
        setZoom(next);
        setPan({ x: (root.clientWidth - canvas.width * next) / 2, y: (root.clientHeight - canvas.height * next) / 2 });
      };
      React.useEffect(() => {
        const root = viewport.current;
        const wheel = event => {
          event.preventDefault();
          if (!event.ctrlKey && !event.metaKey) return setPan(before => ({ x: before.x - event.deltaX, y: before.y - event.deltaY }));
          const box = root.getBoundingClientRect();
          changeZoom(zoom * Math.exp(-event.deltaY * .005), { x: event.clientX - box.left, y: event.clientY - box.top });
        };
        root.addEventListener('wheel', wheel, { passive: false });
        return () => root.removeEventListener('wheel', wheel);
      }, [zoom, pan]);
      const activeIds = state.activeJobIds || [state.activeJobId];
      const active = state.jobs.filter(job => activeIds.includes(job.id)
        && state.targets.find(item => item.uid === job.uid)?.enabled !== false && platformReady(state, job.platform || state.targets.find(item => item.uid === job.uid)?.platform || 'weibo'));
      const summaries = state.archiveSummary || [];
      const count = state.count;
      const platforms = [...new Set([...state.targets.map(item => item.platform || 'weibo'), ...(state.platforms || []).map(item => item.id)])].map(id => {
        const targets = state.targets.filter(item => (item.platform || 'weibo') === id);
        return { id, name: platformNames[id] || id, targets,
          count: targets.reduce((sum, item) => sum + (summaries.find(row => row.uid === item.uid)?.count || 0), 0) };
      });
      const hasOpenTask = item => {
        const jobs = state.jobs.filter(job => job.uid === item.uid);
        return item.enabled !== false && (!jobs.length || jobs.some(job => job.status === 'queued'));
      };
      const fold = (key, open) => setFolds(before => !!before[key] === !open ? before : { ...before, [key]: !open });
      const choose = id => setFolds(before => ({ ...before, ['card-' + id]: !before['card-' + id] }));
      React.useEffect(() => {
        try { localStorage.setItem(NAME + ':flow-folds' + (preview ? ':preview' : ''), JSON.stringify(folds)); } catch { /* UI preferences are optional. */ }
      }, [folds]);
      React.useEffect(() => {
        const update = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', update);
        return () => document.removeEventListener('visibilitychange', update);
      }, []);
      const palette = ['#d9a52b', '#c07a3e', '#7b5cff', '#5b8fce', '#e96b72'];
      const color = id => palette[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length];
      const statusText = id => preview ? '未配置 · 示例' : monitorStatus(state, id).kind === 'ready' ? '监控中' : monitorStatus(state, id).label;
      const icon = (kind, size = 20) => {
        const shapes = {
          plugin: ['M6 7h12v10H6z', 'M9 3v4m6-4v4M9 17v4m6-4v4M2 10h4m-4 4h4m12-4h4m-4 4h4', 'M10 10h4v4h-4z'],
          database: ['M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3Z', 'M4 6v12c0 2 4 3 8 3s8-1 8-3V6', 'M4 12c0 2 4 3 8 3s8-1 8-3'],
          file: ['M14 3H6a1 1 0 0 0-1 1v16h14V8z', 'M14 3v5h5M9 12h6m-6 4h6'],
        };
        return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
          strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, shapes[kind].map((d, i) => h('path', { d, key: i })));
      };
      React.useEffect(() => {
        const before = previousSummaries.current;
        const next = Object.fromEntries(summaries.map(row => [row.uid, { count: row.count, at: row.last_saved_at || 0 }]));
        previousSummaries.current = next;
        if (!before || preview) return;
        const authors = summaries.filter(row => row.count > (before[row.uid]?.count || 0) || row.last_saved_at > (before[row.uid]?.at || 0));
        if (!authors.length) return;
        setSavedPulse({ key: Date.now(), uids: authors.map(row => row.uid), count: authors.reduce((sum, row) => sum + Math.max(0, row.count - (before[row.uid]?.count || 0)), 0) });
      }, [state.archiveSummary, preview]);
      React.useEffect(() => {
        if (!savedPulse) return;
        const timer = setTimeout(() => setSavedPulse(null), 4200);
        return () => clearTimeout(timer);
      }, [savedPulse]);
      const probing = item => !preview && item.capture_mode !== 'pending' && item.enabled !== false && platformReady(state, item.platform || 'weibo')
        && state.jobs.some(job => job.uid === item.uid && job.status === 'queued') && !state.jobs.some(job => job.uid === item.uid && job.status === 'needs_review');
      const saving = item => !!savedPulse?.uids.includes(item.uid);
      React.useEffect(() => {
        const root = stage.current;
        if (!root) return;
        let frame;
        const draw = () => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const bounds = root.getBoundingClientRect(), scale = bounds.width / root.offsetWidth;
            const node = key => root.querySelector(`[data-flow-node="${key}"]`);
            const edges = platforms.flatMap(platform => {
              const selected = true;
              const enabled = state.enabled !== false && state.platforms?.find(source => source.id === platform.id)?.enabled !== false;
              const reading = platform.targets.some(item => active.some(job => job.uid === item.uid));
              const sources = folds['source-' + platform.id]
                ? [{ id: 'group-' + platform.id, from: 'group-' + platform.id, to: 'platform-' + platform.id, color: color(platform.id), selected, enabled: enabled && platform.targets.some(hasOpenTask), active: reading, probe: platform.targets.some(probing), saving: platform.targets.some(saving), step: 0 }]
                : platform.targets.map(item => ({ id: item.uid, from: 'author-' + item.uid, to: 'platform-' + platform.id,
                  color: color(item.uid), selected: true, enabled: enabled && hasOpenTask(item), active: active.some(job => job.uid === item.uid), probe: probing(item), saving: saving(item), step: 0 }));
              return [...sources, { id: 'platform-' + platform.id, from: 'platform-' + platform.id, to: 'plugin', color: '#f36c75', selected, enabled: enabled && platform.targets.some(hasOpenTask), active: reading, probe: platform.targets.some(probing), saving: platform.targets.some(saving), step: 1 }];
            });
            edges.push({ id: 'archive', from: 'plugin', to: 'database', color: '#f0444b', selected: true, enabled: state.enabled !== false && platforms.some(platform => state.platforms?.find(source => source.id === platform.id)?.enabled !== false && platform.targets.some(hasOpenTask)), active: false, probe: false, saving: !!savedPulse, step: 2 });
            edges.push({ id: 'im', from: 'plugin', to: 'im', color: '#7b5cff', selected: true, enabled: state.agent?.transportAvailable && state.agent?.config?.enabled && pushDestinations(state.agent.config).some(item => item.enabled !== false), active: false, probe: false, saving: false, step: 2 });
            const next = edges.flatMap(edge => {
              const from = node(edge.from), to = node(edge.to);
              if (!edge.enabled || !from || !to || !from.getClientRects().length || !to.getClientRects().length) return [];
              const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
              const x1 = (a.right - bounds.left) / scale + 1, y1 = (a.top + a.height / 2 - bounds.top) / scale;
              const x2 = (b.left - bounds.left) / scale - 1, y2 = (b.top + b.height / 2 - bounds.top) / scale;
              const bend = Math.max((x2 - x1) * .55, 16);
              return [{ ...edge, d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` }];
            });
            setWires(before => JSON.stringify(before) === JSON.stringify(next) ? before : next);
          });
        };
        const observer = new ResizeObserver(draw);
        observer.observe(root);
        root.querySelectorAll('[data-flow-node]').forEach(node => observer.observe(node));
        draw();
        return () => { observer.disconnect(); cancelAnimationFrame(frame); };
      }, [state.agent, state.targets, uid, state.activeJobId, state.activeJobIds, state.accounts, state.stopped, state.enabled, state.platforms, state.jobs, state.archiveSummary, savedPulse, folds, preview, zoom]);

      const toggle = (label, enabled, scope, extra = {}, text) => h('button', { type: 'button', role: 'switch',
        'aria-label': label + '监控开关', 'aria-checked': enabled !== false, disabled: busy,
        className: 'st-monitor-switch' + (enabled === false ? ' off' : ''),
        title: enabled === false ? '点击启用' + label + '监控' : '点击暂停' + label + '监控；实际执行还取决于上级开关与账号状态',
        onClick: () => control({ scope, enabled: enabled === false, ...extra }) },
        h('i'), h('span', null, text || (enabled === false ? '暂停' : '启用')));
      const column = (number, title, children) => h('section', { className: 'st-flow-col', 'aria-label': title }, h('div', { className: 'st-flow-stack' }, children));
      return h(React.Fragment, null,
        h('div', { className: 'st-flow-top' },
          h('div', { className: 'totals' }, h('span', null, h('b', null, platforms.filter(source => state.targets.some(target => target.platform === source.id)).length), '个监控平台'), h('span', null, h('b', null, state.targets.length), preview ? '个示例博主' : '位博主'), h('span', null, h('b', null, count.toLocaleString()), preview ? '条示例内容' : '条留存')),
          h('div', { className: 'st-canvas-tools', 'aria-label': '画布工具' },
            h('button', { 'aria-label': '缩小画布', disabled: zoom <= .05, onClick: () => changeZoom(zoom - .1) }, '−'),
            h('output', { 'aria-label': '画布缩放比例' }, Math.round(zoom * 100), '%'),
            h('button', { 'aria-label': '放大画布', disabled: zoom >= 2, onClick: () => changeZoom(zoom + .1) }, '+'),
            h('button', { onClick: fitCanvas }, '适应窗口'),
            h('button', { onClick: () => { setZoom(1); setPan({ x: 0, y: 0 }); } }, '重置视图'),
            h('button', { onClick: () => {
              const collapsed = state.targets.every(item => folds['card-' + item.uid]);
              setFolds(before => ({ ...before, ...Object.fromEntries(state.targets.map(item => ['card-' + item.uid, !collapsed])) }));
            } }, state.targets.every(item => folds['card-' + item.uid]) ? '展开全部卡片' : '收起全部卡片'),
            h('button', { onClick: () => {
              const collapsed = state.targets.every(item => folds['detail-' + item.uid]);
              setFolds(before => ({ ...before, ...Object.fromEntries(state.targets.map(item => ['detail-' + item.uid, !collapsed])) }));
            } }, state.targets.every(item => folds['detail-' + item.uid]) ? '展开频率详情' : '收起频率详情'))),
        h('div', { className: 'st-flow-scroll', ref: viewport, role: 'region', tabIndex: 0, 'aria-label': '博主到本地文档的内容流向图',
          onPointerDown: event => {
            if (event.button !== 0 || event.target.closest('button,a,input,select,summary')) return;
            const root = event.currentTarget;
            drag.current = { x: event.clientX, y: event.clientY, left: pan.x - root.firstElementChild.scrollLeft, top: pan.y - root.firstElementChild.scrollTop };
            root.setPointerCapture(event.pointerId); root.classList.add('is-dragging'); event.preventDefault();
          },
          onPointerMove: event => { const start = drag.current; if (start) setPan({ x: start.left + event.clientX - start.x, y: start.top + event.clientY - start.y }); },
          onLostPointerCapture: event => { drag.current = null; event.currentTarget.classList.remove('is-dragging'); },
          onPointerUp: event => { drag.current = null; event.currentTarget.classList.remove('is-dragging'); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); },
        }, h('div', { className: 'st-flow-surface', style: { width: '100%', height: '100%' } },
          h('div', { className: 'st-flow-stage' + (folds.platforms ? ' st-collapse-sources' : ''), ref: stage, style: { width: canvas.width, transform: 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')' } },
            h('svg', { className: 'st-flow-svg', 'aria-hidden': true }, wires.map(wire => h('g', { key: wire.id, 'data-probing': wire.probe ? 'true' : undefined, 'data-saving': wire.saving ? 'true' : undefined },
              h('path', { 'data-flow-edge': wire.id, d: wire.d, stroke: wire.color, className: 'st-flow-wire' + (wire.selected ? ' selected' : '') + (wire.active && visible ? ' active' : '') }),
              (wire.probe || preview && wire.id !== 'archive') && visible ? h('circle', { r: 3, fill: '#8970ef', opacity: 0, className: 'st-flow-particle st-probe-particle', 'data-direction': 'reverse' },
                h('animateMotion', { dur: '4s', repeatCount: 'indefinite', path: wire.d, keyPoints: '1;0;0', keyTimes: '0;0.25;1', calcMode: 'linear', begin: wire.step === 1 ? '0s' : '.9s' }),
                h('animate', { attributeName: 'opacity', values: '0;.9;.9;0;0', keyTimes: '0;.03;.22;.26;1', dur: '4s', repeatCount: 'indefinite', begin: wire.step === 1 ? '0s' : '.9s' })) : null,
              wire.saving && savedPulse && visible ? h('circle', { key: savedPulse.key, r: 4.5, fill: '#f0444b', opacity: 0, className: 'st-flow-particle st-save-particle', 'data-direction': 'forward' },
                h('animateMotion', { dur: '.85s', repeatCount: 2, begin: 'indefinite', ref: node => node?.beginElementAt(wire.step * .7), path: wire.d }),
                h('animate', { attributeName: 'opacity', values: '0;1;1;0', keyTimes: '0;.06;.9;1', dur: '.85s', repeatCount: 2, begin: 'indefinite', ref: node => node?.beginElementAt(wire.step * .7) })) : null))),
            column('01', '关注的博主', state.targets.length ? platforms.map(platform => h('details', {
              key: platform.id, className: 'st-source-group', open: !folds['source-' + platform.id],
              onToggle: event => fold('source-' + platform.id, event.currentTarget.open),
            }, h('summary', { 'data-flow-node': 'group-' + platform.id }, h('span', { className: 'st-chevron' }, '⌄'),
              h('span', null, '展开', platform.name, '博主')),
            h('div', { className: 'st-source-list', style: { '--avatar-columns': Math.min(4, Math.max(1, Math.ceil(platform.targets.length / 4))) } }, platform.targets.map(item => {
              const branchPaused = state.enabled === false || state.platforms?.find(source => source.id === platform.id)?.enabled === false || !hasOpenTask(item);
              const effective = monitorStatus(state, platform.id, item.uid);
              return h('div', { key: item.uid,
                className: 'st-flow-node st-author-node' + (branchPaused ? ' st-branch-paused' : '') + (folds['card-' + item.uid] ? ' st-avatar-only' : '') + (probing(item) && visible ? ' st-probing' : '') + (saving(item) && visible ? ' st-saving' : ''),
                style: { '--node-color': color(item.uid) } },
                h('div', { className: 'st-author-info' }, h('div', { className: 'st-author-title' }, h('strong', { title: item.name }, /^\d+$/.test(item.name) ? '博主资料待读取' : item.name),
                  h('button', { className: 'st-link-button', 'aria-label': '查看博主：' + item.name, onClick: () => navigate(preview ? 'settings' : 'archive', { uid: preview ? '' : item.uid }) }, '查看消息'),
                  h('button', { className: 'st-node-gear', 'aria-label': '设置博主：' + item.name, disabled: preview || busy, onClick: () => openSettings({ scope: 'target', uid: item.uid, platform: platform.id }) }, h(GearIcon))),
                  h('div', { className: 'st-streams' }, [['updates', '新动态'], ['history', '历史缓存']].map(([kind, label]) => {
                    const job = state.jobs.find(job => job.uid === item.uid && job.kind === kind);
                    const status = streamStatus(state, item, kind);
                    return h('div', { key: kind, className: 'st-stream-row' }, h('button', { className: 'st-stream-status' + (['监控中', '缓存中', '补查中'].includes(status) ? ' is-running' : ''), title: effective.reason, disabled: preview, onClick: () => {
                      const status = streamStatus(state, item, kind);
                      if (status === '等待连接') return navigate('settings', { platform: platform.id, section: 'account' });
                      if (status === '需处理') return navigate('tasks', { uid: item.uid });
                      openSettings({ scope: 'target', uid: item.uid, platform: platform.id, tab: kind === 'history' ? 'history' : 'frequency' });
                    } }, h('span', null, label), h('b', null, preview ? '待设置' : status)),
                      h('button', { role: 'switch', 'aria-label': item.name + (kind === 'history' ? '历史缓存' : '新动态') + '开关', 'aria-checked': item.enabled !== false && job?.status === 'queued', className: 'st-monitor-switch st-job-switch' + (item.enabled === false || job?.status !== 'queued' ? ' off' : ''),
                        disabled: busy || preview || !job || item.capture_mode === 'pending' || job.status === 'complete',
                      title: job?.status === 'complete' ? '所选可见消息已缓存，可通过齿轮更改缓存范围' : '只控制' + label + '；平台或总控关闭时不会执行', onClick: () => {
                          if (kind === 'history' && (item.enabled === false || job.status !== 'queued') && !job.pages && !job.pending && item.capture_mode !== 'history') return openSettings({ scope: 'target', uid: item.uid, platform: platform.id, tab: 'history' });
                          jobControl(job, item.enabled === false || job.status !== 'queued');
                        } }, h('i')));
                  })),
                  h('details', { className: 'st-author-detail', open: !folds['detail-' + item.uid], onToggle: event => fold('detail-' + item.uid, event.currentTarget.open) },
                    h('summary', { 'aria-label': '展开或收起' + item.name + '监控频率' }, '监控频率'),
                    !preview ? h(FrequencyNote, { state, platform: platform.id, uid: item.uid, navigate: () => openSettings({ scope: 'target', uid: item.uid, platform: platform.id, tab: 'frequency' }) }) : null)),
                h('button', { type: 'button', className: 'st-author-select', 'data-flow-node': 'author-' + item.uid,
                  'aria-expanded': !folds['card-' + item.uid], 'aria-label': '展开或收起博主卡片：' + item.name, title: item.name + (folds['card-' + item.uid] ? ' · 点击展开卡片' : ' · 点击只保留头像'),
                  onClick: () => choose(item.uid) }, h(AuthorAvatar, { target: item })));
            })))) : h('div', { className: 'st-source-empty' }, '添加一位博主，建立你的第一条内容流。',
              h('button', { onClick: () => navigate('settings') }, '+ 添加博主'))),
            column('02', '内容来源平台', platforms.length ? platforms.map(platform =>
              h('div', { key: platform.id, className: 'st-platform-group' }, h('div', { className: 'st-flow-node st-flow-platform' + (state.enabled === false || state.platforms?.find(source => source.id === platform.id)?.enabled === false ? ' st-branch-paused' : ''), 'data-flow-node': 'platform-' + platform.id,
                style: { '--node-color': color(platform.id) } },
                h('button', { className: 'st-node-gear', 'aria-label': '设置' + platform.name + '平台', disabled: preview || busy, onClick: () => openSettings({ scope: 'platform', platform: platform.id }) }, h(GearIcon)),
                h('button', { type: 'button', className: 'st-platform-select', onClick: () => fold('source-' + platform.id, !!folds['source-' + platform.id]), 'aria-expanded': !folds['source-' + platform.id],
                'aria-label': '展开或收起' + platform.name + '博主' },
                h('span', { className: 'st-node-icon' }, platform.id === 'weibo' ? h('img', { className: 'st-weibo-logo', src: BASE + '/assets/weibo.ico', alt: '微博' }) : platform.id === 'xueqiu' ? h('img', { className: 'st-platform-logo', src: BASE + '/assets/xueqiu.png', alt: '雪球' }) : platform.id === 'x' ? '𝕏' : platform.name.slice(0, 1)), h('strong', null, platform.name),
                h('small', null, platform.targets.length, ' 位 · ', platform.count.toLocaleString(), ' 条已存'),
                h('span', { className: 'st-platform-fold-mark', 'aria-hidden': true }, folds['source-' + platform.id] ? '›' : '⌄')),
                h('button', { className: 'st-platform-tag st-platform-repair' + (!platformReady(state, platform.id) ? ' warn' : ''), onClick: () => navigate('settings', { platform: platform.id, section: 'account' }), 'aria-label': '查看' + platform.name + '平台' }, h('i'), statusText(platform.id)), toggle(platform.name, state.platforms?.find(source => source.id === platform.id)?.enabled, 'platform', { platform: platform.id }, state.platforms?.find(source => source.id === platform.id)?.enabled === false ? '平台已关闭' : '平台已开启')),
                !preview ? h(FrequencyNote, { state, platform: platform.id, navigate: () => openSettings({ scope: 'platform', platform: platform.id }) }) : null)).concat(platforms.some(platform => platform.id === 'xueqiu') ? [] : [
                  h('button', { key: 'xueqiu-development', className: 'st-flow-node st-flow-platform st-development-platform', 'aria-label': '连接雪球平台', onClick: () => navigate('settings', { platform: 'xueqiu' }) },
                    h('span', { className: 'st-node-icon' }, h('img', { className: 'st-platform-logo', src: BASE + '/assets/xueqiu.png', alt: '雪球' })), h('strong', null, '雪球'), h('small', null, '未连接'))])
              : h('div', { className: 'st-platform-later' }, '等待添加关注对象')),
            column('03', '你的监控与缓存插件', h('div', { className: 'st-flow-node st-flow-hub', 'data-flow-node': 'plugin' },
              h('div', { className: 'st-hub-brand' }, h('button', { className: 'st-node-gear', 'aria-label': '设置 Social Trace Agent', disabled: busy, onClick: openAgent }, h(GearIcon)), h('button', { className: 'st-hub-symbol', 'aria-label': '展开或收起全部平台', 'aria-expanded': !folds.platforms, onClick: () => fold('platforms', !!folds.platforms) }, icon('plugin', 29)),
                h('strong', null, 'Social Trace'), folds.platforms ? h('small', null, platforms.length, ' 平台 · ', state.targets.length, ' 位博主已收起') : null, toggle('总控制器', state.enabled, 'all', {}, state.enabled === false ? '总控已关闭' : '总控已开启')),
              !preview ? h('small', { className: 'st-agent-node-state' }, state.agent?.config?.enabled ? '原文推送已开启' : '推送未开启 · 齿轮配置') : null,
              h('div', { className: 'st-hub-jobs' },
                h('button', { className: 'st-hub-job', title: '北京时间今天发布且今天首次保存的新动态，不含开始监控前的旧消息', onClick: () => navigate('notices', { kind: 'update' }) }, h('span', null, '今日新增'), h('b', null, (state.todayNewCount || 0).toLocaleString(), ' 条')),
                h('button', { className: 'st-hub-job', onClick: () => navigate(preview ? 'settings' : 'archive', { uid: '' }) }, h('span', null, '累计已存'), h('b', null, count.toLocaleString(), ' 条')),
                h('button', { className: 'st-hub-job', onClick: () => navigate('notices') }, h('span', null, '未读消息'), unreadNotices(state) ? h('b', null, unreadNotices(state), ' 条') : h('span', { className: 'st-muted' }, '无未读'))),
              )),
            column('04', '保存与推送', h(React.Fragment, null, h('details', { className: 'st-flow-node st-library' + (savedPulse && visible ? ' st-save-arrival' : ''), 'data-flow-node': 'database',
              style: { '--node-color': '#b5a8db' }, open: !folds.library, onToggle: event => fold('library', event.currentTarget.open) },
              h('summary', { className: 'st-library-head' }, h('span', { className: 'st-node-icon' }, icon('database')),
                h('div', null, h('strong', null, '我的本地资料库'), h('small', null, count.toLocaleString(), ' 条已存', !preview && state.unreadContent?.total ? ' · ' + state.unreadContent.total + ' 条未读' : '')),
                h('span', { className: 'st-chevron' }, '⌄')),
              h('div', { className: 'st-library-tree' }, libraryItems.map(item => {
                const owner = summaries.find(row => row.uid === item.uid);
                return h('details', { key: item.uid, className: 'st-author-folder' + (uid === item.uid ? ' selected' : ''),
                  'data-archive-author': item.uid, open: folds['author-' + item.uid] === false, onToggle: event => { if (event.currentTarget.open) setFolds(before => ({ ...before, ...Object.fromEntries(state.targets.map(target => ['author-' + target.uid, target.uid !== item.uid])) })); else fold('author-' + item.uid, false); } },
                  h('summary', null, h('span', { className: 'st-chevron' }, '⌄'),
                    h(AuthorAvatar, { target: item, size: 'small', style: { '--node-color': color(item.uid) } }), h('strong', { title: item.name }, item.name), h('small', null, platformNames[item.platform || 'weibo'] || item.platform), h('b', null, (owner?.count || 0).toLocaleString() + ' 条已存', !preview && unreadFor(state, item.uid) ? ' · ' + unreadFor(state, item.uid) + ' 未读' : '')),
                  h('div', { className: 'st-author-docs' },
                    h('button', { type: 'button', className: 'st-link-button', onClick: () => navigate(preview ? 'settings' : 'archive', preview ? {} : { uid: item.uid }) }, preview ? '配置监控 →' : '查看已留存正文 →'),
                    h('small', null, '最近保存：', owner?.last_saved_at ? date(owner.last_saved_at) : '尚未保存'),
                    !preview && unreadFor(state, item.uid) ? h('button', { className: 'st-link-button', disabled: busy, onClick: () => acknowledge(item.uid) }, '确认已读 ' + unreadFor(state, item.uid)) : null,
                    preview ? h('small', null, '配置后生成本地文档') : h('div', { className: 'st-flow-exports' }, h('a', { href: `${BASE}/export?format=md&uid=${encodeURIComponent(item.uid)}`, download: true,
                      onClick: event => { event.preventDefault(); void download('md', item.uid); } }, 'Markdown ↗'),
                      h('a', { href: `${BASE}/export?format=jsonl&uid=${encodeURIComponent(item.uid)}`, download: true,
                        onClick: event => { event.preventDefault(); void download('jsonl', item.uid); } }, 'JSONL ↗'))));
              })), libraryPages > 1 ? h('nav', { className: 'st-library-pages', 'aria-label': '资料库博主翻页' },
                h('button', { type: 'button', 'aria-label': '上一组博主', disabled: currentLibraryPage === 0, onClick: () => setLibraryPage(currentLibraryPage - 1) }, '‹'),
                h('span', null, (currentLibraryPage + 1) + ' / ' + libraryPages),
                h('button', { type: 'button', 'aria-label': '下一组博主', disabled: currentLibraryPage + 1 === libraryPages, onClick: () => setLibraryPage(currentLibraryPage + 1) }, '›')) : null,
              h('button', { className: 'st-library-foot st-link-button', onClick: () => navigate(preview ? 'settings' : 'archive', { uid: '' }) }, preview ? '配置资料库 →' : '打开全部档案 →')), h('div', { className: 'st-flow-node st-im-node', 'data-flow-node': 'im' }, h(IMSummary, { agent: state.agent }), h('button', { className: 'st-link-button', onClick: openAgent }, '配置推送渠道 →'))))))),
        h('p', { className: 'st-canvas-hint' }, '拖动空白处平移 · Ctrl / ⌘ + 滚轮缩放 · 触屏可滑动浏览'),
        h('div', { className: 'st-flow-bottom', 'aria-live': 'polite' }, h('div', { className: 'st-flow-legend' }, h('span', null, h('i'), '← 定时探测'), h('span', null, h('i', { className: 'save' }), '新内容入库 →'),
            h('span', null, h('i', { className: 'wait' }), '暂停 / 异常时停止探测')), savedPulse ? h('span', { className: 'st-save-feedback' }, savedPulse.count ? '+' + savedPulse.count + ' 条已入库' : '正文已更新入库') : null));
    }
    function CaptureChoice({ state, target, act, navigate, busy, openSettings }) {
      const account = platformAccount(state, target.platform);
      const connected = account?.status === 'ready';
      const waitUntil = account?.cooldown_until || 0;
      const ready = connected && !!target.profile_checked_at && !busy;
      return h('section', { className: 'st-capture-choice', 'aria-label': '确认记录方式' },
        !connected ? h('div', { className: 'st-empty' }, h('h3', null, '先连接' + platformNames[target.platform] + '账号'), h('p', null, '登录后读取博主资料，确认记录方式后才开始保存内容。'),
          h('button', { onClick: () => navigate('settings', { platform: target.platform, section: 'account' }) }, '去登录' + platformNames[target.platform]))
        : !target.profile_checked_at ? h('div', { className: 'st-empty' }, h('h3', null, busy ? '正在读取博主资料…' : '读取博主资料'),
          h('p', null, waitUntil > Date.now() ? platformNames[target.platform] + '要求暂缓访问，冷却至 ' + date(waitUntil) + ' 后可读取资料。' : '先确认昵称、头像和平台显示的消息总数，此步骤不会缓存正文。'),
          h('button', { disabled: busy || waitUntil > Date.now(), onClick: () => act('/targets/profile', { uid: target.uid, platform: target.platform, interactive: true }) }, '重新读取'))
        : h(React.Fragment, null,
          h('p', { className: 'st-profile-total' }, '平台显示 ', h('strong', null, target.profile_total == null ? '总数暂不可用' : Number(target.profile_total).toLocaleString() + (target.platform === 'weibo' ? ' 条微博' : ' 条消息')),
            h('small', { className: 'st-caption' }, ' · 包含原创与转发，实际可保存数量以账号可访问范围为准')),
          h('p', { className: 'st-caption', style: { overflowWrap: 'anywhere' } }, '保存到：', state.storage?.documentsDirectory, '/', target.platform || 'weibo', '/', target.external_uid || target.uid, ' ', h('button', { className: 'st-link-button', onClick: () => navigate('settings', { section: 'workspace' }) }, '更改保存位置')),
          h('h3', null, '从什么时候开始保存？'),
          h('div', { className: 'st-capture-options' },
            h('section', null, h('h3', null, '从现在开始记录'), h('p', null, '只保存确认之后发布的新动态，不补存以前的消息。'),
              h('button', { className: 'st-primary', disabled: !ready, onClick: () => act('/targets/start', { uid: target.uid, platform: target.platform, mode: 'from_now' }) }, '从现在开始')),
            h('section', null, h('h3', null, '同时缓存以前的消息'), h('p', null, '选择时间范围和内容类型，确认后缓存旧消息，并同时监控新动态。'),
              h('button', { className: 'st-primary', disabled: !ready, onClick: () => openSettings({ scope: 'target', uid: target.uid, platform: target.platform, tab: 'history' }) }, '设置历史缓存'))),
          h('p', { className: 'st-caption' }, '全量历史会慢慢读取；进度、剩余估计和暂停原因可随时查看，稍后也能调整缓存范围。')));
    }
    function Panel() {
      const [state, setState] = React.useState(null);
      const [tab, setTab] = React.useState('overview');
      const [followOpen, setFollowOpen] = React.useState(false);
      const [readerTab, setReaderTab] = React.useState('content');
      const [adding, setAdding] = React.useState(false);
      const [nodeSettings, setNodeSettings] = React.useState(null);
      const [agentOpen, setAgentOpen] = React.useState(false);
      const [updateOpen, setUpdateOpen] = React.useState(false);
      const [agentTab, setAgentTab] = React.useState('settings');
      const returnToAdd = React.useRef(false);
      const [focusSection, setFocusSection] = React.useState('');
      const main = React.useRef(null);
      const [sample, setSample] = React.useState(previewState);
      const [uid, setUid] = React.useState('');
      const [query, setQuery] = React.useState('');
      const [posts, setPosts] = React.useState([]);
      const [focusedPost, setFocusedPost] = React.useState('');
      const [postsLoading, setPostsLoading] = React.useState(true);
      const [offset, setOffset] = React.useState(0);
      const [postKind, setPostKind] = React.useState('all');
      const [noticeKind, setNoticeKind] = React.useState('all');
      const [loginWindows, setLoginWindows] = React.useState({});
      const [platform, setPlatform] = React.useState('weibo');
      const loginOpened = !!loginWindows[platform];
      const [error, setError] = React.useState('');
      const [errorSection, setErrorSection] = React.useState('service');
      const [busy, setBusy] = React.useState(false);
      const [workspacePath, setWorkspacePath] = React.useState('');
      const [savedMessage, setSavedMessage] = React.useState('');
      React.useEffect(() => {
        if (!savedMessage) return;
        const timer = setTimeout(() => setSavedMessage(''), 4000);
        return () => clearTimeout(timer);
      }, [savedMessage]);
      const profileAttempts = React.useRef(new Set());
      const [profileClock, setProfileClock] = React.useState(0);
      const navigate = (next, options = {}) => {
        if (next === 'tasks') {
          const owner = state?.targets.find(item => item.uid === (options.uid || uid));
          const problem = state?.jobs.find(job => job.uid === owner?.uid && job.status === 'needs_review');
          next = 'archive'; options = { ...options, uid: owner?.uid || '', view: problem?.kind === 'updates' ? 'frequency' : 'history' };
        }
        if (next === 'settings' && options.section === 'frequency') {
          setNodeSettings({ scope: 'platform', platform: options.platform || platform }); next = 'overview'; options = { ...options, section: '' };
        }
        if (options.section === 'add-target') { if (options.platform) setPlatform(options.platform); setError(''); setAdding(true); return; }
        if (next === 'archive') { setReaderTab(options.view || 'content'); setNodeSettings(null); setFollowOpen(true); }
        if (next === 'archive' && options.uid && state?.targets.find(item => item.uid === options.uid)?.capture_mode === 'pending') profileAttempts.current.delete(options.uid);
        if (options.uid !== undefined) { setFocusedPost(options.postId || ''); setUid(options.uid); setQuery(''); setPostKind('all'); setOffset(0); }
        const nextPlatform = options.platform || (options.uid !== undefined ? state?.targets.find(item => item.uid === options.uid)?.platform : null);
        if (nextPlatform) setPlatform(nextPlatform);
        if (next === 'notices') setNoticeKind(options.kind || 'all');
        setTab(next); setFocusSection(options.section || '');
        requestAnimationFrame(() => {
          const element = options.section ? document.getElementById('st-' + options.section) : main.current;
          if (options.section) { element?.scrollIntoView({ block: 'start', behavior: 'smooth' }); element?.focus({ preventScroll: true }); }
          else main.current?.scrollTo({ top: 0 });
        });
      };
      React.useEffect(() => {
        if (!state) return;
        let active = true;
        void api('/update', undefined, AbortSignal.timeout(12000)).then(result => { if (active && result.update) {
          setState(before => before ? { ...before, update: result.update } : before);
          try { const pending = JSON.parse(localStorage.getItem(NAME + ':update-pending')); if (pending?.version === result.update.currentVersion) { localStorage.removeItem(NAME + ':update-pending'); setSavedMessage('插件已更新至 v' + pending.version); } } catch {}
        } }).catch(() => {});
        return () => { active = false; };
      }, [!!state]);
      const stateEpoch = React.useRef(0);
      const reload = React.useCallback(async () => { setState(await api('/status')); }, []);
      React.useEffect(() => { if (state?.storage) setWorkspacePath(state.storage.workspaceDirectory); }, [state?.storage?.workspaceDirectory]);
      React.useEffect(() => {
        let active = true;
        const load = async () => {
          const epoch = stateEpoch.current;
          try { const next = await api('/status'); if (active && epoch === stateEpoch.current) setState(next); }
          catch (err) { if (active && epoch === stateEpoch.current) setError(err.message); }
        };
        void load();
        const visibleLoad = () => { if (!document.hidden) void load(); };
        const timer = setInterval(visibleLoad, 5000);
        document.addEventListener('visibilitychange', visibleLoad);
        return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', visibleLoad); };
      }, []);
      const latestSavedAt = state?.archiveSummary?.reduce((last, row) => Math.max(last, row.last_saved_at || 0), 0) || 0;
      React.useEffect(() => {
        if (tab !== 'archive') return;
        if (!uid || state?.targets.find(item => item.uid === uid)?.capture_mode === 'pending') { setPosts([]); setPostsLoading(false); return; }
        if (readerTab !== 'content') return;
        let active = true;
        setPostsLoading(true);
        api(`/posts?uid=${encodeURIComponent(uid)}&q=${encodeURIComponent(query)}&kind=${postKind}&offset=${offset}${focusedPost ? '&postId=' + encodeURIComponent(focusedPost) : ''}`)
          .then(result => { if (active) { setPosts(result.items); setPostsLoading(false); } })
          .catch(err => { if (active) { setError(err.message); setErrorSection('service'); setPostsLoading(false); } });
        return () => { active = false; };
      }, [tab, uid, readerTab, query, postKind, offset, focusedPost, state?.count, latestSavedAt, state?.targets.find(item => item.uid === uid)?.capture_mode]);
      const act = async (path, body = {}) => {
        stateEpoch.current++;
        setBusy(true); setError(''); setSavedMessage('');
        setErrorSection(path.startsWith('/agent/') ? 'agent' : path === '/history/range' || path === '/settings/history' ? 'history' : path === '/monitoring' || path === '/notices/read' || path.startsWith('/jobs/') ? 'service' : path.startsWith('/workspace') ? 'workspace' : path === '/settings' || path === '/targets/policy' ? 'frequency' : path === '/targets' ? 'add-target' : 'account');
        try {
          const result = await api(path, { platform, ...body });
          const next = await api('/status'); setState(next);
          if (path === '/targets') {
            const added = next.targets.find(item => !state.targets.some(before => before.uid === item.uid));
            if (added) navigate('archive', { uid: added.uid, platform: added.platform });
            setSavedMessage('已添加博主，正在读取昵称与头像；监控尚未开启');
          }
          if (/^\/jobs\//.test(path)) {
            const job = state.jobs.find(item => path.includes(item.id));
            setSavedMessage((state.targets.find(item => item.uid === job?.uid)?.name || '所选博主') + '：' + (job?.kind === 'history' ? '历史缓存' : '更新检查') + (path.endsWith('/pause') ? '已暂停，已保存内容和断点保留' : '已开启；账号未就绪或上级开关暂停时会等待'));
          }
          if (path === '/targets/profile') setSavedMessage(next.targets.find(item => item.uid === body.uid)?.capture_mode === 'pending' ? '' : (next.targets.find(item => item.uid === body.uid)?.name || body.uid) + '：昵称与头像已更新');
          if (path === '/login') setLoginWindows(before => ({ ...before, [body.platform || platform]: true }));
          if (path === '/verify') {
            const connectedPlatform = body.platform || platform;
            setLoginWindows(before => ({ ...before, [connectedPlatform]: false }));
            const owners = next.targets.filter(item => item.platform === connectedPlatform);
            if (returnToAdd.current || !owners.length) { returnToAdd.current = false; navigate('settings', { platform: connectedPlatform, section: 'add-target' }); }
            else if (owners.every(item => item.capture_mode === 'pending')) navigate('archive', { uid: owners[0].uid, platform: connectedPlatform });
          }
          if (path === '/history/range') setSavedMessage('缓存范围已更新，已有内容保留');
          if (path === '/notices/read') {
            const owner = state.targets.find(item => item.uid === body.uid);
            const notice = state.notices.find(item => item.id === body.id);
            const category = { update: '新动态', attention: '待处理提醒', task: '任务提醒' };
            setSavedMessage(owner ? owner.name + '：新动态已全部标为已读' : notice ? '已读：' + notice.message : body.kind ? category[body.kind] + '已全部标为已读' : '全部消息已标为已读');
          }
          if (path === '/verify') setSavedMessage(platformNames[body.platform || platform] + '已连接');
          if (path === '/targets/start') setSavedMessage(body.kind ? (next.targets.find(item => item.uid === body.uid)?.name || body.uid) + '：' + (body.kind === 'history' ? '历史缓存已开启' : '新动态监控已开启') : body.mode === 'from_now' ? '已开启：从此刻记录新动态' : '已开启：监控新动态并分批补存历史');
          if (path === '/settings') setSavedMessage(platformNames[platform] + '监控频率已保存');
          if (path === '/workspace') setSavedMessage('信息保存位置已更新，原文件已保留');
          if (path === '/workspace/sync') setSavedMessage(body.images ? result.ok ? '图片备份完成' : '部分图片尚未备份，可稍后重试' : next.storage.error ? '文档同步失败，请检查保存位置' : '文档同步完成');
          return true;
        }
        catch (err) {
          if (path === '/verify' && err.kind === 'login') setLoginWindows(before => ({ ...before, [body.platform || platform]: false }));
          if (err.kind === 'wait') {
            try { await reload(); } catch {}
            if (body.interactive) setError((platformNames[body.platform || platform] || '平台') + '当前处于请求间隔或访问冷却中，请稍后重试');
            return null;
          }
          setError(err.message); return false;
        }
        finally { stateEpoch.current++; setBusy(false); }
      };
      React.useEffect(() => {
        if (!state || busy) return;
        const candidates = state.targets.filter(item => item.capture_mode === 'pending' && !item.profile_checked_at && !profileAttempts.current.has(item.uid) && platformAccount(state, item.platform)?.status === 'ready');
        const next = candidates.find(item => item.uid === uid) || candidates[0];
        if (!next) return;
        const account = platformAccount(state, next.platform);
        const interactive = tab === 'archive' && next.uid === uid && next.platform === 'weibo';
        const profileAt = state.platforms?.find(source => source.id === next.platform)?.profileRequestAt || 0;
        const wait = Math.max(interactive ? profileAt : account?.next_request_at || 0, account?.cooldown_until || 0) - Date.now();
        if (wait > 0) {
          const timer = setTimeout(() => setProfileClock(value => value + 1), Math.min(wait + 100, 2147483647));
          return () => clearTimeout(timer);
        }
        profileAttempts.current.add(next.uid);
        void act('/targets/profile', { uid: next.uid, platform: next.platform, interactive }).then(result => {
          if (result === null) { profileAttempts.current.delete(next.uid); setProfileClock(value => value + 1); }
        });
      }, [state, busy, uid, tab, profileClock]);
      const pickWorkspace = async () => {
        setErrorSection('workspace');
        setBusy(true); setError(''); setSavedMessage('');
        try {
          const picker = globalThis.__DSH_DIRECTORY_PICKER__;
          const directory = picker?.pick ? await picker.pick() : (await api('/workspace/pick', {})).directory;
          if (directory) setWorkspacePath(directory);
        }
        catch (err) { setError(err.message); }
        finally { setBusy(false); }
      };
      const download = async (format, author = uid) => {
        setErrorSection('workspace'); setError('');
        try {
          const response = await fetch(`${BASE}/export?format=${format}&uid=${encodeURIComponent(author)}`);
          if (!response.ok) throw new Error(`导出失败（HTTP ${response.status}），请检查后台连接`);
          const url = URL.createObjectURL(await response.blob());
          const link = document.createElement('a'); link.href = url;
          link.download = `social-trace-${(author || 'all').replace(/[^a-zA-Z0-9_-]/g, '-')}.${format}`;
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) { setError(err.message); }
      };
      const openNodeSettings = context => {
        setError(''); setSavedMessage('');
        if (tab === 'archive' && context.uid) {
          navigate('archive', { uid: context.uid, platform: context.platform, view: context.tab || 'frequency' });
          return;
        }
        setNodeSettings(context);
      };
      const button = (text, onClick, className = '') => h('button', { type: 'button', onClick, className, disabled: busy }, text);
      const openAttention = notice => {
        setError('');
        if (/推送|投递|dsh-im/i.test(notice.message)) { setAgentTab('deliveries'); setAgentOpen(true); return; }
        if (state.jobs.some(job => job.uid === notice.uid && job.status === 'needs_review')) { navigate('tasks', { uid: notice.uid }); return; }
        navigate('settings', { platform: state.targets.find(target => target.uid === notice.uid)?.platform || (/雪球/.test(notice.message) ? 'xueqiu' : 'weibo'), section: /文档|文件夹|图片|磁盘/.test(notice.message) ? 'workspace' : 'account' });
      };
      const account = state ? platformAccount(state, platform) : null;
      const platformName = platformNames[platform];
      const accountState = account?.status === 'ready' && account.cooldown_until > Date.now() ? 'cooling_down' : account?.status;
      const hasAuthorization = account?.status === 'ready' || account?.status === 'paused' && !!account.uid;
      const target = state?.targets.find(item => item.uid === uid);
      const unread = unreadNotices(state);
      const originals = (state?.archiveSummary || []).filter(item => !uid || item.uid === uid).reduce((n, row) => n + (row.original_count || 0), 0);
      const reposts = (state?.archiveSummary || []).filter(item => !uid || item.uid === uid).reduce((n, row) => n + (row.repost_count || 0), 0);
      const titles = { overview: '监控流向', archive: '关注与档案', notices: '消息中心', settings: '连接与设置' };
      const effective = tab === 'overview' ? overviewStatus(state, platform) : monitorStatus(state, platform, uid);
      const effectivePlatform = effective.platform || platform;
      const effectiveSource = state?.platforms?.find(source => source.id === effectivePlatform);
      const effectiveAccount = state && platformAccount(state, effectivePlatform);
      const effectiveName = platformNames[effectivePlatform];
      const firstUse = state && (!state.targets.length || state.targets.every(item => item.capture_mode === 'pending'));
      const showPreview = !state || !state.targets.length;
      let content;
      if (!state && tab !== 'overview') content = h('div', { className: 'st-empty' },
        h('h3', null, error ? '后台尚未连接' : '正在打开本地档案库…'),
        error ? h('p', null, '后台恢复连接后，账号、频率和信息保存位置会显示在这里。') : null,
        !error ? button('重试连接', () => reload().then(() => setError('')).catch(err => setError(err.message))) : null);
      else if (tab === 'overview') content = h(React.Fragment, null,
        h('div', { className: 'st-modebar' },
          h('span', { className: 'st-mode-label' }, showPreview ? '效果预览 · 不发起采集' : '我的社交监控'),
          h('div', { className: 'st-actions' },
            !showPreview ? button('+ 添加博主', () => navigate('settings', { section: 'add-target' })) : null,
            (showPreview || ['blocked', 'partial'].includes(effective.kind) || state.enabled === false || effectiveSource?.enabled === false || effective.section === 'archive') ? button(showPreview ? '开始配置 →' : effective.kind === 'partial' ? '查看异常' : effective.kind === 'blocked' ? effective.section === 'tasks' ? '检查任务' : effectiveAccount?.status === 'needs_login' ? '登录' + effectiveName : effectiveAccount?.status === 'needs_verification' ? '完成验证' : '恢复连接' : state.enabled === false ? '开启总控' : effectiveSource?.enabled === false ? '开启平台监控' : effective.section === 'archive' ? '选择监控对象' : '查看博主',
              () => showPreview ? navigate('settings', { section: 'account' }) : state.enabled === false ? act('/monitoring', { scope: 'all', enabled: true })
                : effectiveSource?.enabled === false ? act('/monitoring', { scope: 'platform', platform: effectivePlatform, enabled: true }) : ['blocked', 'partial'].includes(effective.kind) && effective.section !== 'tasks' ? navigate('settings', { platform: effectivePlatform, section: effective.section }) : effective.section === 'archive' ? navigate('archive', { uid: '' }) : navigate('tasks', { uid: state.jobs.find(job => job.status === 'needs_review' && state.targets.find(target => target.uid === job.uid)?.platform === effectivePlatform)?.uid || uid }), 'st-primary') : null)),
        h(FlowOverview, { key: showPreview ? 'preview' : 'live', state: showPreview ? sample : state,
          uid: showPreview ? '' : uid, preview: showPreview,
          navigate, download, busy,
          openAgent: () => { setError(''); setAgentTab('settings'); setAgentOpen(true); }, acknowledge: author => act('/notices/read', { uid: author, kind: 'update' }), openSettings: openNodeSettings, jobControl: (job, enabled) => act('/jobs/' + job.id + '/' + (enabled ? 'resume' : 'pause'), { enableTarget: enabled }), control: body => {
            if (!showPreview) return act('/monitoring', body);
            setSample(before => ({ ...before, ...(body.scope === 'all' ? { enabled: body.enabled } : {}),
              platforms: before.platforms.map(source => body.scope === 'platform' && source.id === body.platform ? { ...source, enabled: body.enabled } : source),
              targets: before.targets.map(item => body.scope === 'target' && item.uid === body.uid ? { ...item, enabled: body.enabled } : item) }));
          } }));
      else if (tab === 'archive' && target?.capture_mode === 'pending' && readerTab === 'content') content = h(CaptureChoice, { key: target.uid, state, target, act, navigate, busy, openSettings: openNodeSettings });
      else if (tab === 'archive' && !uid) content = state.targets.length ? h(React.Fragment, null,
        h(AuthorList, { state, act, busy, navigate, openSettings: openNodeSettings }),
        h('div', { className: 'st-flow-exports' }, ['md', 'jsonl'].map(format => h('a', { key: format, href: BASE + '/export?format=' + format, download: true, onClick: event => { event.preventDefault(); void download(format); } }, format === 'md' ? '导出全部 Markdown' : '导出全部 JSONL'))))
        : h('div', { className: 'st-empty' }, h('h3', null, '添加第一位博主'), button('+ 添加博主', () => navigate('settings', { section: 'add-target' }), 'st-primary'));
      else if (tab === 'archive' && target && readerTab !== 'content') content = h(NodeSettings, { key: target.uid + readerTab, embedded: true,
        context: { scope: 'target', uid: target.uid, platform: target.platform, tab: readerTab }, state, act, busy, error, navigate, openSettings: openNodeSettings, close: () => setReaderTab('content') });
      else if (tab === 'archive') content = h(React.Fragment, null,
        focusedPost ? h('div', { className: 'st-message-toolbar' }, h('span', { className: 'st-caption' }, '提醒对应的动态'), button('查看这位博主的全部内容', () => navigate('archive', { uid }))) : h(React.Fragment, null,
        h('div', { className: 'st-feed-filters' }, [['all', '全部'], ['original', '原创 ' + originals], ['repost', '转发 ' + reposts]].map(([key, title]) => h('button', { key, type: 'button', 'aria-pressed': postKind === key,
          onClick: () => { setPostKind(key); setOffset(0); } }, title))),
        h('div', { className: 'st-toolbar' }, h('input', { 'aria-label': '搜索留存正文', placeholder: '搜索已留存的文字…', value: query,
          onChange: event => { setQuery(event.target.value); setOffset(0); } }),
        h('a', { href: `${BASE}/export?format=md&uid=${uid}`, download: true,
          onClick: event => { event.preventDefault(); void download('md'); } }, '导出 Markdown'),
        h('a', { href: `${BASE}/export?format=jsonl&uid=${uid}`, download: true,
          onClick: event => { event.preventDefault(); void download('jsonl'); } }, 'JSONL'))),
        postsLoading ? h('div', { className: 'st-empty', role: 'status' }, '正在读取本地档案…') : posts.length ? posts.map(post => h('article', { className: 'st-card', key: post.id },
          h('div', { className: 'st-card-head' }, h('div', null, h('h3', null, post.author), h(PostTimes, { publishedAt: post.published_at, detectedAt: post.detected_at, savedAt: post.first_seen_at, kind: post.capture_kind })),
            h('span', { className: 'st-badge' + (post.complete ? '' : ' warn'), title: '首次保存于 ' + date(post.first_seen_at) }, post.article ? '文章链接' : post.complete ? post.quote ? '转发' : '原创' : '正文待补齐')),
          post.images?.length && post.text.trim() === '分享图片' || post.quote && ['转发微博', '快转微博'].includes(post.text.trim()) ? null : h('div', { className: 'st-text' }, post.article ? h('a', { href: post.url, target: '_blank', rel: 'noreferrer' }, post.text.split('\n\n')[0] + ' ↗') : post.text),
          h(ImageGallery, { post, images: post.images }), h(QuoteBlock, { post }),
          !post.article ? h('div', { className: 'st-card-head st-caption st-post-footer' }, h('a', { href: post.url, target: '_blank', rel: 'noreferrer' }, '查看原文 ↗')) : null))
          : h('div', { className: 'st-empty' }, h('h3', null, focusedPost ? '这条动态暂不可用' : query ? '没有找到匹配内容' : state.targets.length ? '还没有留存内容' : '添加第一位博主'),
            h('p', null, focusedPost ? '可以查看这位博主的其他留存内容。' : query ? '试试其他关键词，或清空搜索。' : postKind !== 'all' ? '这个分类暂无消息，可以切换到全部查看。' : state.targets.length ? target && platformReady(state, target.platform || 'weibo') && streamStatus(state, target, 'history') === '未开启' ? '这里只保存开启监控后发布的新动态。需要以前的消息，可在「历史消息缓存」中开启。' : effective.reason : '添加博主后，动态和历史内容会逐步留存在本机。'),
            query ? button('清空搜索', () => { setQuery(''); setOffset(0); }) : state.targets.length ? h('div', { className: 'st-actions st-empty-actions' },
              effective.kind === 'blocked' ? button('处理连接', () => navigate('settings', { section: effective.section }), 'st-primary') : null)
              : button('+ 添加博主', () => navigate('settings', { section: 'add-target' }), 'st-primary')),
        !focusedPost && (posts.length || offset) ? h('nav', { className: 'st-pagination', 'aria-label': '内容翻页' }, h('button', { type: 'button', disabled: busy || offset === 0, onClick: () => { setOffset(Math.max(0, offset - 50)); main.current?.scrollTo({ top: 0 }); } }, '上一页'),
          h('span', { className: 'st-caption' }, `第 ${offset / 50 + 1} 页`),
          posts.length === 50 ? button('下一页', () => setOffset(offset + 50)) : null) : null);
      else if (tab === 'notices') content = h(React.Fragment, null,
        h('div', { className: 'st-message-toolbar' }, h('div', { className: 'st-feed-filters' }, [['all', '全部'], ['update', '新动态'], ['attention', '待处理'], ['task', '任务进度']].map(([key, title]) => h('button', { key, 'aria-pressed': noticeKind === key, onClick: () => setNoticeKind(key) }, title,
          unreadNotices(state, key) ? h('span', { className: 'st-nav-badge', 'aria-label': unreadNotices(state, key) + ' 条未读' }, unreadNotices(state, key)) : null))), button(noticeKind === 'all' ? '全部标为已读' : '本类标为已读', () => act('/notices/read', noticeKind === 'all' ? {} : { kind: noticeKind }))),
        h('div', { className: 'st-message-list', role: 'list' }, state.notices.filter(item => noticeKind === 'all' || item.kind === noticeKind).map(notice => h('div', { className: 'st-message-row' + (!notice.read_at ? ' unread' : ''), key: notice.id, role: 'listitem' },
          h('span', { className: 'st-message-type ' + notice.kind + (notice.read_at ? ' read' : '') }, { update: '动态', attention: '待处理', task: '任务' }[notice.kind] || '系统'),
          h('div', { className: 'st-message-copy' }, h('p', null, notice.message.replace(/长文接口未返回全文，保留断点并暂停/g, '有一条长内容暂时读不完整，历史缓存已暂停；已保存内容不受影响。')), notice.published_at ? h(PostTimes, { publishedAt: notice.published_at, detectedAt: notice.detected_at, savedAt: notice.saved_at }) : h('time', null, '提醒生成：', date(notice.created_at))),
          h('div', { className: 'st-actions' }, notice.kind === 'attention' ? button('去处理', () => openAttention(notice))
            : notice.uid ? button('查看', () => navigate(notice.kind === 'update' ? 'archive' : 'tasks', { uid: notice.uid, postId: notice.kind === 'update' ? notice.post_id : '' })) : null,
            !notice.read_at ? button('标为已读', () => act('/notices/read', { id: notice.id })) : null)))),
        !state.notices.some(item => noticeKind === 'all' || item.kind === noticeKind) ? h('div', { className: 'st-empty' }, unreadNotices(state, noticeKind) ? '最近提醒中没有此类消息，未读数量包含更早的提醒。' : '暂无此类消息') : null,
        state.notices.length === 100 ? h('p', { className: 'st-caption' }, '显示最近 100 条提醒，未读数量统计全部提醒；完整正文可在关注与档案查看。') : null);
      else content = h('div', { className: 'st-settings-page' },
        h('div', { className: 'st-platform-tabs', role: 'tablist', 'aria-label': '平台配置' }, [['weibo', '微博'], ['xueqiu', '雪球'], ['x', 'X']].map(([id, title]) => h('button', { key: id, role: 'tab', 'aria-selected': platform === id, onClick: () => { setPlatform(id); setFocusSection(''); setError(''); setSavedMessage(''); } }, title))),
        !['weibo', 'xueqiu'].includes(platform) ? h('div', { className: 'st-development' }, h('h3', null, platformName + ' · 开发中'), h('p', null, '暂未开放配置')) : h(React.Fragment, null,
        h('section', { id: 'st-account', tabIndex: -1, 'aria-label': platformName + '账号连接', className: 'st-card st-connection' + (focusSection === 'account' ? ' st-focused' : '') },
          h(SettingRow, { label: platformName + '账号', description: loginOpened ? '保持登录窗口打开，完成后确认连接' : hasAuthorization ? account?.status === 'ready' ? '用于读取关注博主的内容' : '授权已保留，可检查连接状态' : '登录后才能监控与缓存消息' },
            h('div', { className: 'st-account-controls' }, h('span', { className: 'st-connection-state ' + accountState }, hasAuthorization ? account?.status === 'ready' ? '已登录' : '授权已保存' : loginOpened ? '等待确认' : labels[accountState] || '未连接'),
              !hasAuthorization ? button(loginOpened ? '我已登录，继续' : '登录' + platformName, () => act(loginOpened ? '/verify' : '/login'), 'st-primary') : null,
              button('检查连接', () => act('/verify')))),
          error && errorSection === 'account' ? h('p', { className: 'st-inline-error', role: 'alert' }, error) : !loginOpened && accountState !== 'ready' && account?.reason && !/请先登录|请在.*登录|请在.*验证/.test(account.reason) ? h('p', { className: 'st-caption' }, account.reason) : null),
        state.jobs.filter(job => job.status === 'needs_review' && state.targets.find(owner => owner.uid === job.uid)?.platform === platform).map(job => h(SettingRow, { key: job.id, label: (state.targets.find(owner => owner.uid === job.uid)?.name || job.uid) + ' · ' + (job.kind === 'history' ? '历史缓存' : '新动态监控'), description: taskProblem(job) }, button(job.kind === 'history' ? '查看缓存问题' : '查看监控问题', () => navigate('archive', { uid: job.uid, view: job.kind === 'history' ? 'history' : 'frequency' })))),
        h('section', { id: 'st-workspace', tabIndex: -1, 'aria-label': '信息保存位置', className: 'st-card st-workspace' + (focusSection === 'workspace' ? ' st-focused' : '') },
          h('form', { className: 'st-form', onSubmit: event => { event.preventDefault(); void act('/workspace', { directory: workspacePath }); } },
            h(SettingRow, { label: '信息保存位置', htmlFor: 'st-workspace-path', description: '消息和图片按平台、博主分别保存' }, h('input', { id: 'st-workspace-path', 'aria-label': '信息保存位置', value: workspacePath, required: true, placeholder: '选择或填写文件夹完整路径',
              onChange: event => setWorkspacePath(event.target.value), spellCheck: false }),
              h('div', { className: 'st-actions' }, button('选择文件夹', pickWorkspace), h('button', { className: 'st-primary', disabled: busy || !workspacePath.trim() || workspacePath === state.storage?.workspaceDirectory && state.storage?.workspaceConfigured !== false }, busy ? '正在处理…' : workspacePath === state.storage?.workspaceDirectory && state.storage?.workspaceConfigured === false ? '确认保存位置' : '保存位置')))),
          error && errorSection === 'workspace' ? h('p', { className: 'st-inline-error', role: 'alert' }, error) : null,
          state.storage?.changing || state.storage?.syncing ? h(SettingRow, { label: '保存状态' }, h('span', { className: 'st-caption', role: 'status' }, '正在同步已有内容…')) : null,
          state.storage?.mediaError ? h(SettingRow, { label: '图片备份', description: '部分图片尚未保存，正文已保留。可以重试保存图片。' }, button('重试图片备份', () => act('/workspace/sync', { images: true }))) : null,
          state.storage?.error ? h(SettingRow, { label: '文档保存', description: '本地文档尚未同步完成，请重试；已采集的内容仍保留在资料库中。' }, button('重试文档同步', () => act('/workspace/sync'))) : null,
          h('details', { className: 'st-setting-help' }, h('summary', null, '更换保存位置说明'), h('p', null, '已有内容会复制到新位置，原文件保留。平台授权独立保存。'))),
        h('section', { className: 'st-settings-im', 'aria-label': 'dsh-im 消息推送' }, h('h2', null, '消息推送'), h(IMSummary, { agent: state.agent }), button('配置推送渠道', () => { setAgentTab('settings'); setAgentOpen(true); })),
        h('p', { className: 'st-settings-footer' }, '电脑关闭或插件退出时停止采集；重新运行后会补查期间仍可见的动态。')));

      return h('div', { className: 'st' + (tab === 'overview' ? ' overview' : '') + (showPreview && tab === 'overview' ? ' st-preview' : '') },
        h('div', { className: 'st-layout' }, h('aside', { className: 'st-aside' }, h('div', { className: 'st-brand' }, 'Social Trace'),
          h('nav', { className: 'st-nav', 'aria-label': 'Social Trace 导航' }, Object.entries(titles).map(([key, title]) => {
            const selected = tab === key;
            return key === 'archive' ? h('details', { key, className: 'st-follow-menu', open: followOpen },
              h('summary', { className: selected ? 'active' : '', 'aria-controls': 'st-follow-authors', onClick: event => { event.preventDefault(); if (selected) setFollowOpen(!followOpen); else navigate('archive', { uid: '' }); } }, h('span', { className: 'st-follow-label' }, title),
                h('span', { className: 'st-follow-fold', 'aria-hidden': true }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: followOpen ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6' })))),
              h('div', { id: 'st-follow-authors', className: 'st-follow-children' }, h('button', { className: 'st-target', onClick: () => navigate('archive', { uid: '' }) }, '全部对象'),
                state?.targets.map(item => h('button', { className: 'st-target', key: item.uid, 'aria-pressed': uid === item.uid,
                  onClick: () => navigate('archive', { uid: item.uid }) }, h(AuthorAvatar, { target: item, size: 'small' }), h('span', null, item.name))),
                button('+ 添加博主', () => navigate('settings', { section: 'add-target' })))) : h('button', {
              key, className: selected ? 'active' : '', onClick: () => navigate(key), 'aria-label': title, 'aria-current': selected ? 'page' : undefined,
            }, h('span', null, title), key === 'notices' && unread ? h('span', { className: 'st-nav-badge', 'aria-hidden': true, title: unread + ' 条未读消息' }, unread > 99 ? '99+' : unread) : null);
          })),
          h('div', { className: 'st-account' }, (state?.platforms || [{ id: 'weibo', name: '微博' }]).map(source =>
            h('button', { key: source.id, className: 'st-sidebar-account', onClick: () => navigate('settings', { platform: source.id, section: 'account' }) }, h('span', { className: 'st-dot ' + (state && platformAccount(state, source.id)?.status === 'ready' ? 'ready' : '') }),
              source.name + ' · ' + (state ? labels[platformAccount(state, source.id)?.status] || '未连接' : '正在连接'))), h(IMSummary, { agent: state?.agent, compact: true, onClick: () => { setAgentTab('settings'); setAgentOpen(true); } })), h('button', { className: 'st-version-entry', onClick: () => setUpdateOpen(true), 'aria-label': '检查插件更新' }, h('span', null, state?.update?.currentVersion ? 'v' + state.update.currentVersion : '版本更新'), h('span', { className: state?.update?.updateAvailable ? 'st-update-available' : '' }, state?.update?.phase === 'applying' ? '更新中' : ['complete', 'restart-required'].includes(state?.update?.phase) ? '重启生效' : state?.update?.phase === 'overridden' ? '需确认版本' : state?.update?.updateAvailable ? '有新版本' : '检查更新'))),
        h('main', { className: 'st-main', ref: main },
          h('header', { className: 'st-head' }, h('div', { className: 'st-page-title' }, tab === 'archive' && uid ? h('button', { className: 'st-back', 'aria-label': '返回博主列表', title: '返回博主列表', onClick: () => navigate('archive', { uid: '' }) }, h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'm15 6-6 6 6 6' }))) : null, h('h1', null, titles[tab])),
            h('div', { className: 'st-head-tools' },
              tab === 'overview' ? h('button', { className: 'st-flow-status ' + (showPreview ? 'preview' : effective.kind), title: effective.reason, onClick: () => effective.section === 'tasks' ? navigate('tasks', { uid: state.jobs.find(job => job.status === 'needs_review' && state.targets.find(target => target.uid === job.uid)?.platform === effectivePlatform)?.uid || '' }) : navigate('settings', { platform: effectivePlatform, section: effective.section }) }, h('i'), showPreview ? '未配置 · 效果预览' : effective.kind === 'ready' ? '监控中' : effective.label)
                : null,
              tab === 'archive' ? button('+ 添加博主', () => navigate('settings', { section: 'add-target' }), 'st-primary') : null,
              null)),
          firstUse && ['overview', 'settings'].includes(tab) && ['weibo', 'xueqiu'].includes(platform) ? h('ol', { className: 'st-setup-steps', 'aria-label': '首次使用流程' }, ['确认保存位置', '连接' + platformName, '添加博主', '选择记录方式'].map((text, i) => h('li', { key: text, 'aria-current': (state.storage?.workspaceConfigured === false ? i === 0 : accountState !== 'ready' ? i === 1 : !state.targets.length ? i === 2 : i === 3) ? 'step' : undefined },
            button(text, () => i === 0 ? navigate('settings', { section: 'workspace' }) : i === 1 ? navigate('settings', { section: 'account' }) : i === 2 || !state.targets.length ? navigate('settings', { section: 'add-target' }) : navigate('archive', { uid: state.targets.find(item => item.capture_mode === 'pending')?.uid || '' }), 'st-link-button')))) : null,
          savedMessage ? h('div', { className: 'st-saved', role: 'status' }, h('span', null, savedMessage), h('small', null, '4 秒后自动关闭'), h('button', { 'aria-label': '关闭操作提醒', onClick: () => setSavedMessage('') }, '×')) : null,
          error && !agentOpen && !nodeSettings && !(tab === 'archive' && uid && readerTab !== 'content') && !adding && (tab !== 'settings' || ['service', 'history'].includes(errorSection)) ? h('div', { className: 'st-error', role: 'alert' }, error, ' ', button(errorSection === 'service' ? '重试连接' : errorSection === 'workspace' ? '查看保存位置' : errorSection === 'frequency' ? '查看频率设置' : errorSection === 'history' ? '检查缓存日期' : '处理' + platformName + '连接', () => errorSection === 'service' ? reload().then(() => setError('')).catch(err => setError(err.message)) : errorSection === 'history' ? navigate('archive', { uid }) : navigate('settings', { platform, section: errorSection })), ' ', button('关闭', () => setError(''))) : null,
          state?.stopped ? h('div', { className: 'st-error', role: 'alert' }, state.serviceError || '当前实例已停止调度，请检查是否有其他实例占用档案库。',
            ' ', button('重试启动后台', () => act('/service/retry'))) : null,
          state && tab === 'archive' ? h('section', { className: 'st-identity' }, target ? h(AuthorAvatar, { target }) : null,
            h('select', { 'aria-label': '筛选博主', value: uid, onChange: event => navigate(tab, { uid: event.target.value }) }, h('option', { value: '' }, '全部博主'), state.targets.map(item => h('option', { key: item.uid, value: item.uid }, item.name))),
            target ? h(React.Fragment, null, h('span', { className: 'st-meta-tag st-platform-badge' }, platformNames[target.platform || 'weibo']), h('span', { className: 'st-meta-tag st-uid-tag' }, 'UID ' + (target.external_uid || target.uid))) : null,
            h('div', { className: 'st-identity-actions' },
              target ? h('details', { className: 'st-author-more' }, h('summary', null, '更多'), h('div', null,
                h('a', { href: (target.platform === 'xueqiu' ? 'https://xueqiu.com/u/' : 'https://weibo.com/u/') + (target.external_uid || target.uid), target: '_blank', rel: 'noreferrer' }, platformNames[target.platform || 'weibo'] + '主页 ↗'),
                button('刷新昵称与头像', () => act('/targets/profile', { uid: target.uid, platform: target.platform, interactive: true })))) : null)) : null,
          tab === 'archive' && target ? h('div', { className: 'st-reader-tabs', role: 'tablist', 'aria-label': '博主详情' }, [['content', '留存内容'], ['frequency', '新消息监控'], ['history', '历史消息缓存']].map(([key, label]) => h('button', { key, id: 'st-reader-tab-' + key, role: 'tab', 'aria-controls': key === 'content' ? 'st-reader-content' : 'st-node-panel-' + key, 'aria-selected': readerTab === key, onClick: () => { setReaderTab(key); setError(''); setSavedMessage(''); } }, label))) : null,
          tab === 'archive' && target && readerTab === 'content' ? h('section', { id: 'st-reader-content', role: 'tabpanel', 'aria-labelledby': 'st-reader-tab-content' },
            target.capture_mode !== 'pending' ? h(AuthorProgress, { state, target }) : null, content) : content,
          updateOpen ? h(UpdateDialog, { initial: state?.update, onStatus: update => setState(before => ({ ...before, update })), close: () => setUpdateOpen(false) }) : null,
          agentOpen ? h(AgentSettings, { state, act, busy, error, initialTab: agentTab, close: () => setAgentOpen(false) }) : null,
          adding ? h(AddAuthorDialog, { state, act, busy, error, initialPlatform: tab === 'overview' ? effectivePlatform : platform, clearError: () => setError(''), close: () => setAdding(false), connect: nextPlatform => { setAdding(false); returnToAdd.current = true; navigate('settings', { platform: nextPlatform, section: 'account' }); } }) : null,
          nodeSettings ? h(NodeSettings, { key: (nodeSettings.uid || nodeSettings.scope) + nodeSettings.platform, context: nodeSettings, state, act, busy, error, navigate, openSettings: openNodeSettings, close: () => setNodeSettings(null) }) : null)));
    }
    class PanelGuard extends React.Component {
      state = { failed: false, message: '', busy: false };
      static getDerivedStateFromError() { return { failed: true }; }
      componentDidCatch(error) { console.error('Social Trace 界面错误', error); }
      render() {
        if (!this.state.failed) return h(Panel);
        return h('section', { className: 'st', style: { display: 'block', padding: 24 }, role: 'alert' },
          h('h2', null, '插件界面暂时无法显示'), h('p', null, '已保存的数据仍在本地。可以重新打开界面，或先暂停监控。'),
          h('div', { className: 'st-actions' },
            h('button', { onClick: () => this.setState({ failed: false, message: '' }), disabled: this.state.busy }, '重新打开插件界面'),
            h('button', { disabled: this.state.busy, onClick: async () => {
              this.setState({ busy: true });
              try { await api('/monitoring', { scope: 'all', enabled: false }); this.setState({ message: '监控已暂停' }); }
              catch (error) { this.setState({ message: error.message }); }
              finally { this.setState({ busy: false }); }
            } }, '暂停监控')),
          this.state.message ? h('p', { role: 'status' }, this.state.message) : null);
      }
    }
    return { name: NAME, inject: ['slots'], apply(ctx) {
      let style = document.getElementById(NAME + '-style');
      if (!style) { style = document.createElement('style'); style.id = NAME + '-style'; document.head.appendChild(style); }
      style.textContent = CSS;
      ctx.slots.inject('main', function* () { yield ctx.slots.register({ name: 'main', key: NAME, order: 46 }, PanelGuard); });
      ctx.slots.inject('sidebar.panellist', function* () {
        yield ctx.slots.register({ name: 'sidebar.panellist', id: NAME, order: 46, label: () => 'Social Trace' },
          () => h('svg', { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7 },
            h('path', { d: 'M4 5h16v12H9l-5 4V5Z' }), h('path', { d: 'M8 9h8M8 13h5' })));
      });
    } };
  }
  if (typeof window !== 'undefined' && window.__ModuleLoader__) window.__ModuleLoader__.load({ id: NAME, factory });
})();
