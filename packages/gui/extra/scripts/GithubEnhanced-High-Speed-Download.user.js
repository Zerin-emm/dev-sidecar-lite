/**
 * 当前脚本复制了 `https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js`，并进行了兼容性调整，以兼容 `./tampermonkey.js`。
 * 非常感谢 `Github油猴脚本` 的作者 `X.I.U`，提供了如此优秀的脚本。👍
 *
 * @name			Github 增强 - 高速下载（Github油猴脚本）
 * @name:en			Github Enhancement - High Speed Download（Github Greasemonkey Script）
 * @version			2.6.38_4
 * @since			2026-07-15 13:38
 * @author			X.I.U
 * @description		High-speed download of Git Clone/SSH, Release, Raw, Code(ZIP) and other files (Based on public welfare), project list file quick download (☁)
 * @description:zh-CN	高速下载 Git Clone/SSH、Release、Raw、Code(ZIP) 等文件 (公益加速)、项目列表单文件快捷下载 (☁)
 * @description:zh-TW	高速下載 Git Clone/SSH、Release、Raw、Code(ZIP) 等文件 (公益加速)、項目列表單文件快捷下載 (☁)
 * @license			GPL-3.0 License
 * @namespace		https://greasyfork.org/scripts/412245
 * @supportURL		https://github.com/XIU2/UserScript
 * @homepageURL		https://github.com/XIU2/UserScript
 * @sourceURL		https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js
 */
const ds_github_monkey_version = "2.6.38_4_20260715";
document.addEventListener("DOMContentLoaded", () => {
	const DS_init = (window.__ds_global__ || {})['DS_init']
	if (typeof DS_init === 'function') {
		const options = {
			name: "Github 增强 - 高速下载",
			icon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAAAFzUkdCAK7OHOkAAACEUExURUxpcRgWFhsYGBgWFhcWFh8WFhoYGBgWFiUlJRcVFRkWFhgVFRgWFhgVFRsWFhgWFigeHhkWFv////////////r6+h4eHv///xcVFfLx8SMhIUNCQpSTk/r6+jY0NCknJ97e3ru7u+fn51BOTsPCwqGgoISDg6empmpoaK2srNDQ0FhXV3eXcCcAAAAXdFJOUwCBIZXMGP70BuRH2Ze/LpIMUunHkpQR34sfygAAAVpJREFUOMt1U+magjAMDAVb5BDU3W25b9T1/d9vaYpQKDs/rF9nSNJkArDA9ezQZ8wPbc8FE6eAiQUsOO1o19JolFibKCdHGHC0IJezOMD5snx/yE+KOYYr42fPSufSZyazqDoseTPw4lGJNOu6LBXVUPBG3lqYAOv/5ZwnNUfUifzBt8gkgfgINmjxOpgqUA147QWNaocLniqq3QsSVbQHNp45N/BAwoYQz9oUJEiE4GMGfoBSMj5gjeWRIMMqleD/CAzUHFqTLyjOA5zjNnwa4UCEZ2YK3khEcBXHjVBtEFeIZ6+NxYbPqWp1DLKV42t6Ujn2ydyiPi9nX0TTNAkVVZ/gozsl6FbrktkwaVvL2TRK0C8Ca7Hck7f5OBT6FFbLATkL2ugV0tm0RLM9fedDvhWstl8Wp9AFDjFX7yOY/lJrv8AkYuz7fuP8dv9izCYH+x3/LBnj9fYPBTpJDNzX+7cAAAAASUVORK5CYII=",
			width: 300
		}
		console.log(`ds_github_monkey_${ds_github_monkey_version}: do ds_tampermonkey.DS_init, options:`, options)
		DS_init(options)
	} else {
		console.log(`ds_github_${ds_github_monkey_version}: has no DS_init`)
	}

	if (!((window.__ds_global__ || {}).GM_getValue || (() => true))("ds_enabled", true)) {
		console.log(`ds_github_monkey_${ds_github_monkey_version}: tampermonkey disabled`)
		return
	}

	const GM_registerMenuCommand = (window.__ds_global__ || {})['GM_registerMenuCommand'] || (() => {})
	const GM_unregisterMenuCommand = (window.__ds_global__ || {})['GM_unregisterMenuCommand'] || (() => {})
	const GM_openInTab = (window.__ds_global__ || {})['GM_openInTab'] || (() => {})
	const GM_getValue = (window.__ds_global__ || {})['GM_getValue'] || (() => {})
	const GM_setValue = (window.__ds_global__ || {})['GM_setValue'] || (() => {})
	const GM_notification = (window.__ds_global__ || {})['GM_notification'] || (() => {});
	const GM_setClipboard = (window.__ds_global__ || {})['GM_setClipboard'] || (() => {});
	const DS_hidePlugin = (window.__ds_global__ || {})['hidePlugin'] || (() => {});

	(function() {
		'use strict';
		var menu_rawFast = GM_getValue('xiu2_menu_raw_fast'),
			menu_rawFast_ID,
			menu_rawDownLink_ID,
			menu_gitClone_ID,
			menu_customUrl_ID,
			menu_feedBack_ID,
			menu_hideShortcut_ID,
			menu_showShortcut_ID;
		const download_url_us = [
			['https://gh-proxy.org/https://github.com', 'GH-Proxy', '[GH-Proxy 官方公益加速源]&#10;&#10;官网：https://gh-proxy.org&#10;支持 Releases 附件、源码包(Archive/Tags)、Gist、API、头像等&#10;&#10;源地址：https://gh-proxy.org/https://github.com'],
		], download_url = [
		], clone_url = [
			['https://gh-proxy.org/https://github.com', 'GH-Proxy', '[GH-Proxy 官方公益加速源]&#10;&#10;官网：https://gh-proxy.org&#10;git clone 用法：git clone https://gh-proxy.org/https://github.com/用户名/仓库名.git'],
		], clone_ssh_url = [
			['ssh://git@ssh.github.com:443/', 'Github 原生', '[日本、新加坡等] - Github 官方提供的 443 端口的 SSH（依然是 SSH 协议），适用于限制访问 22 端口的网络环境'],
		], raw_url = [
			['https://gh-proxy.org/https://raw.githubusercontent.com', 'GH-Proxy', '[GH-Proxy 官方公益加速源]&#10;&#10;官网：https://gh-proxy.org&#10;支持 /blob/ 网页路径与 raw 原始文件路径'],
		], svg = [
			'<svg class="octicon octicon-cloud-download" aria-hidden="true" height="16" version="1.1" viewBox="0 0 16 16" width="16"><path d="M9 12h2l-3 3-3-3h2V7h2v5zm3-8c0-.44-.91-3-4.5-3C5.08 1 3 2.92 3 5 1.02 5 0 6.52 0 8c0 1.53 1 3 3 3h3V9.7H3C1.38 9.7 1.3 8.28 1.3 8c0-.17.05-1.7 1.7-1.7h1.3V5c0-1.39 1.56-2.7 3.2-2.7 2.55 0 3.13 1.55 3.2 1.8v1.2H12c.81 0 2.7.22 2.7 2.2 0 2.09-2.25 2.2-2.7 2.2h-2V11h2c2.08 0 4-1.16 4-3.5C16 5.06 14.08 4 12 4z"></path></svg>'
		], style = ['padding:0 6px; margin-right: -1px; border-radius: 2px; background-color: var(--XIU2-background-color); border-color: var(--borderColor-default); font-size: 11px; color: var(--XIU2-font-color);'];

		if (menu_rawFast == null){menu_rawFast = 1; GM_setValue('xiu2_menu_raw_fast', 1)};
		if (GM_getValue('menu_rawDownLink') == null){GM_setValue('menu_rawDownLink', true)};
		if (GM_getValue('menu_gitClone') == null){GM_setValue('menu_gitClone', true)};
		// 如果自定义加速源不存在或为空则忽略，如果自定义加速源地址存在，则添加到 raw_url、clone_url 数组中
		if (GM_getValue('custom_raw_url')) {raw_url.splice(1, 0, [GM_getValue('custom_raw_url'), '自定义', '[由你自定义的 Raw 加速源]&#10;&#10;提示：点击浏览器右上角 Tampermonkey 扩展图标 - [ #️⃣ 自定义加速源 ]&#10;即可轮流设置 Raw、Git Clone、Release/Code(ZIP) 的自定义加速源地址（留空代表不设置）。'])};
		if (GM_getValue('custom_clone_url')) {clone_url.unshift([GM_getValue('custom_clone_url'), '自定义', '[由你自定义的 Git Clone 加速源]&#10;&#10;提示：点击浏览器右上角 Tampermonkey 扩展图标 - [ #️⃣ 自定义加速源 ]&#10;即可轮流设置 Raw、Git Clone、Release/Code(ZIP) 的自定义加速源地址（留空代表不设置）。'])};
		registerMenuCommand();
		// 注册脚本菜单
		function registerMenuCommand() {
			// 如果反馈菜单ID不是 null，则删除所有脚本菜单
			if (menu_feedBack_ID) {
				GM_unregisterMenuCommand(menu_rawFast_ID);
				GM_unregisterMenuCommand(menu_rawDownLink_ID);
				GM_unregisterMenuCommand(menu_gitClone_ID);
				GM_unregisterMenuCommand(menu_customUrl_ID);
				GM_unregisterMenuCommand(menu_feedBack_ID);
				GM_unregisterMenuCommand(menu_hideShortcut_ID);
				GM_unregisterMenuCommand(menu_showShortcut_ID);
				menu_rawFast = GM_getValue('xiu2_menu_raw_fast');
			}
			// 避免在减少 raw 数组后，用户储存的数据大于数组而报错
			if (menu_rawFast > raw_url.length - 1) menu_rawFast = 0
			menu_rawDownLink_ID = GM_registerMenuCommand(`${GM_getValue('menu_rawDownLink') ? '✅' : '❌'} 项目列表单文件快捷下载 (☁)`, function () {
				if (GM_getValue('menu_rawDownLink') == true) {
					GM_setValue('menu_rawDownLink', false);
					GM_notification({
						text: `已关闭「项目列表单文件快捷下载 (☁)」功能\n（点击刷新网页后生效）`, timeout: 3500, onclick: function () {
							location.reload();
						}
					});
				} else {
					GM_setValue('menu_rawDownLink', true);
					GM_notification({
						text: `已开启「项目列表单文件快捷下载 (☁)」功能\n（点击刷新网页后生效）`, timeout: 3500, onclick: function () {
							location.reload();
						}
					});
				}
				registerMenuCommand();
			}, { title: "点击开关「项目列表单文件快捷下载 (☁)」功能" });
			if (raw_url.length > 1 && GM_getValue('menu_rawDownLink')) menu_rawFast_ID = GM_registerMenuCommand(`&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'][menu_rawFast]} [ ${raw_url[menu_rawFast][1]} ] 加速源 (☁) - 点击切换`, menu_toggle_raw_fast, {title: "点击切换「项目列表单文件快捷下载 (☁)」功能的加速源"});
			menu_gitClone_ID = GM_registerMenuCommand(`${GM_getValue('menu_gitClone')?'✅':'❌'} 添加 git clone 命令`, function(){if (GM_getValue('menu_gitClone') == true) {GM_setValue('menu_gitClone', false); GM_notification({text: `已关闭「添加 git clone 命令」功能`, timeout: 3500});} else {GM_setValue('menu_gitClone', true); GM_notification({text: `已开启「添加 git clone 命令」功能`, timeout: 3500});}registerMenuCommand();}, {title: "点击开关「添加 git clone 命令」功能"});
			menu_customUrl_ID = GM_registerMenuCommand(`#️⃣ 自定义加速源`, function () {
				// 定义三种自定义加速源的键名和描述
				const customKeys = [
					{ key: 'custom_raw_url', desc: 'Raw 加速源', placeholder: 'https://example.com/https://raw.githubusercontent.com' },
					{ key: 'custom_clone_url', desc: 'Git Clone 加速源', placeholder: 'https://example.com/https://github.com' },
					{ key: 'custom_download_url', desc: 'Release/Code(ZIP) 加速源', placeholder: 'https://example.com/https://github.com' }
				];
				// 递归弹出输入框
				function promptCustomUrl(index = 0) {
					if (index >= customKeys.length) {GM_notification({ text: '自定义加速源设置已完成！\n（点击刷新网页后生效）', timeout: 3500, onclick: function () { location.reload(); } });return;}
					const { key, desc, placeholder } = customKeys[index];
					let current = GM_getValue(key, '');
					let input = prompt(`请输入自定义${desc}地址：\n- 当前：\n${current || '(未设置)'}\n\n- 示例：\n${placeholder}\n\n- 留空为不设置\n- 点击 [确定] 保存 并 继续设置下一个\n- 点击 [取消] 不保存 并 终止后续设置`,current);
					if (input !== null) {GM_setValue(key, input.trim());promptCustomUrl(index + 1);}// 如果用户点击 取消 按钮，则不再继续弹出
				}
				promptCustomUrl();
			});
			menu_feedBack_ID = GM_registerMenuCommand('💬 反馈问题 & 功能建议', function () {GM_openInTab('https://github.com/XIU2/UserScript', {active: true,insert: true,setParent: true});GM_openInTab('https://greasyfork.org/zh-CN/scripts/412245/feedback', {active: true,insert: true,setParent: true});}, {title: "点击前往反馈问题或提出建议"});
			menu_hideShortcut_ID = GM_registerMenuCommand('🐍 隐藏图标（快捷键：Ctrl+Alt+H）', function () {DS_hidePlugin()}, {title: "点击隐藏图标"});
			menu_showShortcut_ID = GM_registerMenuCommand('🐢 显示图标（快捷键：Ctrl+Alt+S）', null, {title: "隐藏后可通过快捷键呼出图标"});
		}

		// 切换加速源
		function menu_toggle_raw_fast() {
			// 如果当前加速源位置大于等于加速源总数，则改为第一个加速源，反之递增下一个加速源
			if (menu_rawFast >= raw_url.length - 1) {menu_rawFast = 0;} else {menu_rawFast += 1;}
			GM_setValue('xiu2_menu_raw_fast', menu_rawFast);
			delRawDownLink(); // 删除旧加速源
			addRawDownLink(); // 添加新加速源
			GM_notification({text: "已切换加速源为：" + raw_url[menu_rawFast][1], timeout: 3000}); // 提示消息
			registerMenuCommand(); // 重新注册脚本菜单
		};

		colorMode(); // 适配白天/夜间主题模式
		setTimeout(addRawFile, 1000); // Raw 加速
		setTimeout(addRawDownLink, 2000); // Raw 单文件快捷下载（☁），延迟 2 秒执行，避免被 pjax 刷掉

		// Tampermonkey v4.11 版本添加的 onurlchange 事件 grant，可以监控 pjax 等网页的 URL 变化
		if (window.onurlchange === undefined) addUrlChangeEvent();
		window.addEventListener('urlchange', function() {
			colorMode(); // 适配白天/夜间主题模式
			if (location.pathname.indexOf('/releases') > -1) addRelease(); // Release 加速
			setTimeout(addRawFile, 1000); // Raw 加速
			setTimeout(addRawDownLink, 2000); // Raw 单文件快捷下载（☁），延迟 2 秒执行，避免被 pjax 刷掉
			setTimeout(addRawDownLink_, 1000); // 在浏览器返回/前进时重新添加 Raw 下载链接（☁）鼠标事件
		});


		// 判断节点是否属于本脚本自己插入的元素（脚本插入的块会继承 GitHub 容器的 class，
		// 若不排除，MutationObserver 会被自己的插入动作反复触发，形成死循环导致页面卡死）
		function isOwnNode(node) {
			let elm = node;
			while (elm && elm !== document.body) {
				if (elm.classList && (elm.classList.contains('XIU2-GC') || elm.classList.contains('XIU2-GCS') || elm.classList.contains('XIU2-ZIP'))) return true
				elm = elm.parentElement;
			}
			return false
		}

		// 查找 GitHub 原生的克隆输入框（kind: 'https' | 'ssh'；排除本脚本克隆出来的输入框）
		function findCloneInput(root, kind) {
			const sels = (kind === 'ssh')
				? ['input[value^="git@"]:not([title])', 'input[value^="git clone git@"]:not([title])', 'input[value^="git@"]', 'input[value^="git clone git@"]']
				: ['input[value^="https:"]:not([title])', 'input[value^="git clone "]:not([title])', 'input[value^="https:"]', 'input[value^="git clone "]'];
			for (const sel of sels) {
				const list = root.querySelectorAll(sel);
				for (const elm of list) {
					if (!isOwnNode(elm)) return elm
				}
			}
			return null
		}

		// Github Git Clone/SSH、Release、Download ZIP 改版为动态加载文件列表，因此需要监控网页元素变化
		// 说明：新版 GitHub 的 Code 弹层结构不稳定（弹层根节点可能不是 #__primerPortalRoot__ 的直接子节点、
		// 也可能整块不在该 portal 内，克隆输入框还可能自带 title 或已被上一次执行加上 "git clone " 前缀），
		// 因此不再依赖固定的节点层级和 #repository-container-header，改为「只要页面上出现原生克隆输入框，就确保加速块存在」。
		function getCodeDialog() {
			let dialog = document.querySelector('#__primerPortalRoot__');
			if (dialog && (findCloneInput(dialog, 'https') || findCloneInput(dialog, 'ssh'))) return dialog
			// 兼容弹层不在 portal 内的情况：从克隆输入框向上找最近的弹层容器
			const input = findCloneInput(document, 'https') || findCloneInput(document, 'ssh');
			if (input) {
				let elm = input.parentElement;
				while (elm && elm !== document.body) {
					if (elm.className && String(elm.className).indexOf('CodeDropdownButton-module__') !== -1) return elm
					elm = elm.parentElement;
				}
				return input.parentElement && input.parentElement.parentElement ? input.parentElement.parentElement : input.parentElement; // 兜底：输入框的祖父节点
			}
			return null
		}

		// 确保 Code 弹层里的加速块已插入（找不到目标时什么都不做；各 addXxx 内部都有去重保护）
		let ensureGitCloneTimer = null;
		let insertingGitCloneBlock = false;
		function ensureGitCloneBlocks() {
			if (ensureGitCloneTimer || insertingGitCloneBlock) return
			ensureGitCloneTimer = setTimeout(function() {
				ensureGitCloneTimer = null
				const dialog = getCodeDialog();
				if (!dialog) return
				if (document.querySelectorAll('.XIU2-GC, .XIU2-GCS').length > 4) return // 自我保护：异常情况下不再插入，绝不进入死循环
				insertingGitCloneBlock = true;
				try {
					if (!isOwnNode(dialog) && !dialog.querySelector('.XIU2-GC')) addGitClone(dialog);
					if (!isOwnNode(dialog) && !dialog.querySelector('.XIU2-GCS')) addGitCloneSSH(dialog);
					if (!dialog.querySelector('a.XIU2-ZIP')) addDownloadZIP(dialog);
				} finally {
					insertingGitCloneBlock = false;
				}
			}, 50)
		}

		const callback = (mutationsList, observer) => {
			if (location.pathname.indexOf('/releases') > -1) { // Release
				for (const mutation of mutationsList) {
					for (const target of mutation.addedNodes) {
						if (target.nodeType !== 1) continue
						if (target.tagName === 'DIV' && target.dataset.viewComponent === 'true' && target.classList[0] === 'Box') addRelease();
					}
				}
			} else { // 项目首页（不再要求 #repository-container-header 存在，避免新版 UI 改版后整个分支失效）
				for (const mutation of mutationsList) {
					for (const target of mutation.addedNodes) {
						if (target.nodeType !== 1) continue
						if (isOwnNode(target)) continue // 忽略脚本自己插入的元素
						if (target.tagName === 'DIV' && target.className.indexOf('LocalTab-module__') != -1) { // 切换 HTTPS/SSH 标签页时清理另一种加速块
							if (findCloneInput(target, 'https')) {
								addGitCloneClear('.XIU2-GCS'); addGitClone(target);
							} else if (findCloneInput(target, 'ssh')) {
								addGitCloneClear('.XIU2-GC'); addGitCloneSSH(target);
							} else if (target.querySelector('input[value^="gh "]')) {
								addGitCloneClear('.XIU2-GC, .XIU2-GCS');
							}
						}
					}
				}
				ensureGitCloneBlocks();
			}
		};
		const observer = new MutationObserver(callback);
		observer.observe(document, { childList: true, subtree: true });


		// 获取加速源列表（当前内置源只有 GH-Proxy 一个，不再需要随机洗牌）
		function get_New_download_url() {
			let urls = [];
			// 如果用户设置了自定义加速源，则放在最前面
			if (GM_getValue('custom_download_url')) {urls.push([GM_getValue('custom_download_url'), '自定义', '[由你自定义的 Release/Code(ZIP) 加速源地址]&#10;&#10;提示：点击浏览器右上角 Tampermonkey 扩展图标 - [ #️⃣ 自定义加速源 ]&#10;即可轮流设置 Raw、Git Clone、Release/Code(ZIP) 的自定义加速源地址（留空代表不设置）。']);}
			return urls.concat(download_url_us).concat(download_url);
		}

		// Release
		function addRelease() {
			let html = document.querySelectorAll('.Box-footer'); if (html.length == 0 || location.pathname.indexOf('/releases') == -1) return

			// li:hover 鼠标悬停变色
			let styleHover = document.getElementById('XIU2-hover-style');
			if (!styleHover) {
				styleHover = document.createElement('style');
				styleHover.id = 'XIU2-hover-style';
				styleHover.innerHTML = '\n\t.Box-footer ul { padding-top: 1px; }\n\t.Box-footer ul li.Box-row:hover { background-color: var(--bgColor-muted); }\n';
				document.head.appendChild(styleHover);
			}

			let divDisplay = 'margin-left: -90px;', new_download_url = get_New_download_url();
			if (document.documentElement.clientWidth > 755) {divDisplay = 'margin-top: -3px;margin-left: 8px;display: inherit;';}; // 调整小屏幕时的样式
			html[0].appendChild(document.createElement('style')).textContent = '@media (min-width: 768px) {.Box-footer li.Box-row>div>span.color-fg-muted {min-width: 27px !important;}}';
			for (const current of html) {
				if (current.querySelector('.XIU2-RS')) continue
				current.querySelectorAll('li.Box-row a').forEach(function (_this) {
					let href = _this.href.split(location.host),
						url = '', _html = `<div class="XIU2-RS" style="${divDisplay}">`;

					for (let i=0;i<new_download_url.length;i++) {
						url = new_download_url[i][0] + href[1]
						_html += `<a style="${style[0]}" class="btn" href="${url}" target="_blank" title="${new_download_url[i][2]}\n\n提示：如果不想要点击链接在前台打开空白新标签页（一闪而过影响体验），\n可以 [鼠标中键] 或 [Ctrl+鼠标左键] 点击加速链接即可在后台打开新标签页！" rel="noreferrer noopener nofollow">${new_download_url[i][1]}</a>`
					}
					// 兼容 GitHub 新旧版 Release 资产行结构（原版是 _this.parentElement.nextElementSibling.insertAdjacentHTML(...)）：
					// 旧版：<a> 的父元素就是资产行左侧那一列 <div>，它的下一个兄弟节点是右侧那一列（尺寸/摘要/复制按钮，flex-justify-end），
					//   把按钮追加进右列，因此原版效果是「右对齐」。
					// 新版（2024+）：GitHub 在 <a> 外多包了一层 <span class="d-flex flex-items-start">，
					//   它没有下一个兄弟节点，直接调用会抛 TypeError 并中断整个 addRelease()（表现为一个按钮都没有）。
					//   处理方式：从 <a> 向上逐层找第一个「存在下一个兄弟节点」的层级（即原来的左列→右列），继续追加进右列，保持右对齐不变。
					let anchorElm = null, nodeElm = _this.parentElement,
						rowElm = _this.closest('li.Box-row');
					while (nodeElm && nodeElm !== rowElm && nodeElm !== document.body && !anchorElm) {
						anchorElm = nodeElm.nextElementSibling;
						nodeElm = nodeElm.parentElement;
					}
					if (anchorElm) anchorElm.insertAdjacentHTML('beforeend', _html + '</div>');
				});
			}
		}


		// Download ZIP
		function addDownloadZIP(target) {
			const html = target.querySelector('ul[class^=prc-ActionList-ActionList-]>li:last-child');if (!html) return
			if (html.parentElement && html.parentElement.querySelector('a.XIU2-ZIP')) return // 已经插入过加速项，避免重复插入
			let href = html.querySelector('a[href^="/"][href$=".zip"]');if (!href || !href.getAttribute('href')) return
			href = href.getAttribute('href');
			//const href_script = document.querySelector('react-partial[partial-name=repos-overview]>script[data-target="react-partial.embeddedData"]');if (!href_script) return
			//const href = JSON.parse(href_script.textContent).props.initialPayload.overview.codeButton.local.platformInfo.zipballUrl
			/*let href_slice = href_script.textContent.slice(href_script.textContent.indexOf('"zipballUrl":"')+14),
				href = href_slice.slice(0, href_slice.indexOf('"')),*/
			let url = '', _html = '', new_download_url = get_New_download_url();

			// 克隆原 Download ZIP 元素，并定位 <a> <span> 标签
			let html_clone = html.cloneNode(true),
				html_clone_a = html_clone.querySelector('a[href$=".zip"]'),
				html_clone_span = html_clone.querySelector('span[id]');

			for (let i=0;i<new_download_url.length;i++) {
				url = new_download_url[i][0] + href
				html_clone_a.href = url
				html_clone_a.classList.add('XIU2-ZIP'); // 标记加速项，用于去重（MutationObserver 会被反复触发）
				html_clone_a.setAttribute('title', new_download_url[i][2].replaceAll('&#10;','\n') + '\n\n提示：如果不想要点击链接在前台打开空白新标签页（一闪而过影响体验），\n可以 [鼠标中键] 或 [Ctrl+鼠标左键] 点击加速链接即可在后台打开新标签页！');
				html_clone_a.setAttribute('target', '_blank');
				html_clone_a.setAttribute('rel', 'noreferrer noopener nofollow');
				html_clone_span.textContent = 'Download ZIP ' + new_download_url[i][1]
				_html += html_clone.outerHTML
			}
			html.insertAdjacentHTML('afterend', _html);
		}

		// Git Clone 切换清理
		function addGitCloneClear(css) {
			document.querySelectorAll(css).forEach((e)=>{e.remove()})
		}

		// Git Clone
		function addGitClone(target) {
			// 兼容：输入框可能自带 title，或已被上一次执行加上 "git clone " 前缀；findCloneInput 会排除脚本自己克隆出来的输入框
			let html = findCloneInput(target, 'https');if (!html) return
			if (html.parentElement && html.parentElement.nextElementSibling && html.parentElement.nextElementSibling.classList.contains('XIU2-GC')) return // 已经插入过加速块，避免重复插入
			let href_split = html.value.split(location.host)[1],
				html_parent = '<div style="margin-top: 4px;" class="XIU2-GC ' + html.parentElement.className + '">',
				url = '', _html = '', _gitClone = '';
			if (html.nextElementSibling) html.nextElementSibling.hidden = true; // 隐藏右侧复制按钮（考虑到能直接点击复制，就不再重复实现复制按钮事件了）
			if (html.parentElement.nextElementSibling && html.parentElement.nextElementSibling.tagName === 'P'){
				html.parentElement.nextElementSibling.textContent += ' (↑点击文字自动复制)'
			}
			if (GM_getValue('menu_gitClone')) {
				_gitClone = 'git clone ';
				if (html.value.indexOf('git clone ') !== 0) { html.value = _gitClone + html.value; html.setAttribute('value', html.value); } // 避免重复加前缀
			}
			// 克隆原 Git Clone 元素
			let html_clone = html.cloneNode(true);
			for (let i=0;i<clone_url.length;i++) {
				url = clone_url[i][0] + href_split
				html_clone.title = `${url}\n\n${clone_url[i][2].replaceAll('&#10;','\n')}\n\n提示：点击文字可直接复制`
				html_clone.setAttribute('value', _gitClone + url)
				_html += html_parent + html_clone.outerHTML + '</div>'
			}
			html.parentElement.insertAdjacentHTML('afterend', _html);
			if (html.parentElement.parentElement.className.indexOf('XIU2-GCP') === -1){
				html.parentElement.parentElement.classList.add('XIU2-GCP')
				html.parentElement.parentElement.addEventListener('click', (e)=>{if (e.target.tagName === 'INPUT') {GM_setClipboard(e.target.value, {notificationTitle:GM_getValue('menu_gitClone')?'git clone命令已复制：':'git地址已复制：',notification:e.target.value});}})
			}
		}


		// Git Clone SSH
		function addGitCloneSSH(target) {
			// findCloneInput 会排除脚本自己克隆出来的输入框（避免自我触发死循环）
			let html = findCloneInput(target, 'ssh');if (!html) return
			if (html.parentElement && html.parentElement.nextElementSibling && html.parentElement.nextElementSibling.classList.contains('XIU2-GCS')) return // 已经插入过加速块，避免重复插入
			let href_split = html.value.split(':')[1],
				html_parent = '<div style="margin-top: 4px;" class="XIU2-GCS ' + html.parentElement.className + '">',
				url = '', _html = '', _gitClone = '';
			if (html.nextElementSibling) html.nextElementSibling.hidden = true; // 隐藏右侧复制按钮（考虑到能直接点击复制，就不再重复实现复制按钮事件了）
			if (html.parentElement.nextElementSibling && html.parentElement.nextElementSibling.tagName === 'P'){
				html.parentElement.nextElementSibling.textContent += ' (↑点击自动复制)'
			}
			if (GM_getValue('menu_gitClone')) {
				_gitClone = 'git clone ';
				if (html.value.indexOf('git clone ') !== 0) { html.value = _gitClone + html.value; html.setAttribute('value', html.value); } // 避免重复加前缀
			}
			// 克隆原 Git Clone SSH 元素
			let html_clone = html.cloneNode(true);
			for (let i=0;i<clone_ssh_url.length;i++) {
				url = clone_ssh_url[i][0] + href_split
				html_clone.title = `${url}\n\n${clone_ssh_url[i][2].replaceAll('&#10;','\n')}\n\n提示：点击文字可直接复制`
				html_clone.setAttribute('value', _gitClone + url)
				_html += html_parent + html_clone.outerHTML + '</div>'
			}
			html.parentElement.insertAdjacentHTML('afterend', _html);
			if (html.parentElement.parentElement.className.indexOf('XIU2-GCP') === -1){
				html.parentElement.parentElement.classList.add('XIU2-GCP')
				html.parentElement.parentElement.addEventListener('click', (e)=>{if (e.target.tagName === 'INPUT') {GM_setClipboard(e.target.value, {notificationTitle:GM_getValue('menu_gitClone')?'git clone命令已复制：':'git地址已复制：',notification:e.target.value});}})
			}
		}


		// Raw
		function addRawFile() {
			let html = document.querySelector('a[data-testid="raw-button"]');if (!html) return
			let href = location.href.replace(`https://${location.host}`,''),
				href2 = href.replace('/blob/','/'),
				url = '', _html = '';

			for (let i=0;i<raw_url.length;i++) {
				if ((raw_url[i][0].indexOf('/gh') + 3 === raw_url[i][0].length) && raw_url[i][0].indexOf('cdn.staticaly.com') === -1) {
					url = raw_url[i][0] + href.replace('/blob/','@');
				} else {
					url = raw_url[i][0] + href2;
				}
				_html += `<a href="${url}" title="${raw_url[i][2]}\n\n提示：如果想要直接下载，可使用 [Alt + 左键] 点击加速按钮或 [右键 - 另存为...]" target="_blank" role="button" rel="noreferrer noopener nofollow" data-size="small" data-variant="default" class="${html.className} XIU2-RF" style="border-radius: 0;margin-left: -1px;">${raw_url[i][1].replace(/ \d/,'')}</a>`
			}
			if (document.querySelector('.XIU2-RF')) document.querySelectorAll('.XIU2-RF').forEach((e)=>{e.remove()})
			html.insertAdjacentHTML('afterend', _html);
		}


		// Raw 单文件快捷下载（☁）
		function addRawDownLink() {
			if (!GM_getValue('menu_rawDownLink')) return
			// 如果不是项目文件页面，就返回，如果网页有 Raw 下载链接（☁）就返回
			let files = document.querySelectorAll('div.Box-row svg.octicon.octicon-file, .react-directory-filename-column>svg.color-fg-muted');if(files.length === 0) return;if (location.pathname.indexOf('/tags') > -1) return
			let files1 = document.querySelectorAll('a.fileDownLink');if(files1.length > 0) return;

			// 鼠标指向则显示
			var mouseOverHandler = function(evt) {
				let elem = evt.currentTarget,
					aElm_new = elem.querySelectorAll('.fileDownLink'),
					aElm_now = elem.querySelectorAll('svg.octicon.octicon-file, svg.color-fg-muted');
				aElm_new.forEach(el=>{el.style.cssText = 'display: inline'});
				aElm_now.forEach(el=>{el.style.cssText = 'display: none'});
			};

			// 鼠标离开则隐藏
			var mouseOutHandler = function(evt) {
				let elem = evt.currentTarget,
					aElm_new = elem.querySelectorAll('.fileDownLink'),
					aElm_now = elem.querySelectorAll('svg.octicon.octicon-file, svg.color-fg-muted');
				aElm_new.forEach(el=>{el.style.cssText = 'display: none'});
				aElm_now.forEach(el=>{el.style.cssText = 'display: inline'});
			};

			// 循环添加
			files.forEach(function(fileElm) {
				let trElm = fileElm.parentNode.parentNode,
					cntElm_a = trElm.querySelector('[role="rowheader"] > .css-truncate.css-truncate-target.d-block.width-fit > a, .react-directory-truncate>a');
				if (!cntElm_a) return
				let Name = cntElm_a.innerText.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
					href = cntElm_a.getAttribute('href');
				if (!href) return
				let href2 = href.replace('/blob/','/'), url = '';
				if ((raw_url[menu_rawFast][0].indexOf('/gh') + 3 === raw_url[menu_rawFast][0].length) && raw_url[menu_rawFast][0].indexOf('cdn.staticaly.com') === -1) {
					url = raw_url[menu_rawFast][0] + href.replace('/blob/','@');
				} else {
					url = raw_url[menu_rawFast][0] + href2;
				}

				fileElm.insertAdjacentHTML('afterend', `<a href="${url}?DS_DOWNLOAD" download="${Name}" target="_blank" rel="noreferrer noopener nofollow" class="fileDownLink" style="display: none;" title="「${raw_url[menu_rawFast][1]}」&#10;&#10;左键点击下载文件（注意：鼠标点击 [☁] 图标进行下载，而不是文件名！）&#10;&#10;${raw_url[menu_rawFast][2]}&#10;&#10;提示：可在 TamperMonkey 扩展图标的菜单「 #️⃣ 自定义加速源 」里设置你自己的加速源。">${svg[0]}</a>`);
				// 绑定鼠标事件
				trElm.onmouseover = mouseOverHandler;
				trElm.onmouseout = mouseOutHandler;
			});
		}


		// 移除 Raw 单文件快捷下载（☁）
		function delRawDownLink() {
			if (!GM_getValue('menu_rawDownLink')) return
			let aElm = document.querySelectorAll('.fileDownLink');if(aElm.length === 0) return;
			aElm.forEach(function(fileElm) {fileElm.remove();})
		}


		// 在浏览器返回/前进时重新添加 Raw 单文件快捷下载（☁）鼠标事件
		function addRawDownLink_() {
			if (!GM_getValue('menu_rawDownLink')) return
			// 如果不是项目文件页面，就返回，如果网页没有 Raw 下载链接（☁）就返回
			let files = document.querySelectorAll('div.Box-row svg.octicon.octicon-file, .react-directory-filename-column>svg.color-fg-muted');if(files.length === 0) return;
			let files1 = document.querySelectorAll('a.fileDownLink');if(files1.length === 0) return;

			// 鼠标指向则显示
			var mouseOverHandler = function(evt) {
				let elem = evt.currentTarget,
					aElm_new = elem.querySelectorAll('.fileDownLink'),
					aElm_now = elem.querySelectorAll('svg.octicon.octicon-file, svg.color-fg-muted');
				aElm_new.forEach(el=>{el.style.cssText = 'display: inline'});
				aElm_now.forEach(el=>{el.style.cssText = 'display: none'});
			};

			// 鼠标离开则隐藏
			var mouseOutHandler = function(evt) {
				let elem = evt.currentTarget,
					aElm_new = elem.querySelectorAll('.fileDownLink'),
					aElm_now = elem.querySelectorAll('svg.octicon.octicon-file, svg.color-fg-muted');
				aElm_new.forEach(el=>{el.style.cssText = 'display: none'});
				aElm_now.forEach(el=>{el.style.cssText = 'display: inline'});
			};
			// 循环添加
			files.forEach(function(fileElm) {
				let trElm = fileElm.parentNode.parentNode;
				// 绑定鼠标事件
				trElm.onmouseover = mouseOverHandler;
				trElm.onmouseout = mouseOutHandler;
			});
		}


		// 适配白天/夜间主题模式
		function colorMode() {
			let style_Add;
			if (document.getElementById('XIU2-Github')) {style_Add = document.getElementById('XIU2-Github')} else {style_Add = document.createElement('style'); style_Add.id = 'XIU2-Github'; style_Add.type = 'text/css';}
			let backColor = '#ffffff', fontColor = '#888888';

			if (document.lastElementChild.dataset.colorMode === 'dark') { // 如果是夜间模式
				if (document.lastElementChild.dataset.darkTheme === 'dark_dimmed') {
					backColor = '#272e37'; fontColor = '#768390';
				} else {
					backColor = '#161a21'; fontColor = '#97a0aa';
				}
			} else if (document.lastElementChild.dataset.colorMode === 'auto') { // 如果是自动模式
				if (window.matchMedia('(prefers-color-scheme: dark)').matches || document.lastElementChild.dataset.lightTheme.indexOf('dark') > -1) { // 如果浏览器是夜间模式 或 白天模式是 dark 的情况
					if (document.lastElementChild.dataset.darkTheme === 'dark_dimmed') {
						backColor = '#272e37'; fontColor = '#768390';
					} else if (document.lastElementChild.dataset.darkTheme.indexOf('light') == -1) { // 排除夜间模式是 light 的情况
						backColor = '#161a21'; fontColor = '#97a0aa';
					}
				}
			}

			document.lastElementChild.appendChild(style_Add).textContent = `.XIU2-RS a {--XIU2-background-color: ${backColor}; --XIU2-font-color: ${fontColor};}`;
		}


		// 自定义 urlchange 事件（用来监听 URL 变化），针对非 Tampermonkey 油猴管理器
		function addUrlChangeEvent() {
			history.pushState = ( f => function pushState(){
				var ret = f.apply(this, arguments);
				window.dispatchEvent(new Event('pushstate'));
				window.dispatchEvent(new Event('urlchange'));
				return ret;
			})(history.pushState);

			history.replaceState = ( f => function replaceState(){
				var ret = f.apply(this, arguments);
				window.dispatchEvent(new Event('replacestate'));
				window.dispatchEvent(new Event('urlchange'));
				return ret;
			})(history.replaceState);

			window.addEventListener('popstate',()=>{ // 点击浏览器的前进/后退按钮时触发 urlchange 事件
				window.dispatchEvent(new Event('urlchange'))
			});
		}
	})();
	console.log(`ds_github_monkey_${ds_github_monkey_version}: completed`)
})
console.log(`ds_github_monkey_${ds_github_monkey_version}: loaded`)