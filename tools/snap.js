// Lossless screenshot of the page (for docs/demo.gif). Paste into the browser console (or run from an agent),
// start tools/frame_receiver.py, then call:  await snap('01')
// The page is cloned into an SVG <foreignObject>, drawn on a canvas at 2x and sent to the receiver as PNG.
window.snap = async (name, scale = 2) => {
  const W = innerWidth, H = innerHeight, clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('script').forEach(s => s.remove());
  // an image cannot load other files: put the stylesheets inline
  for (const link of clone.querySelectorAll('link[rel=stylesheet]')) {
    const st = document.createElement('style');
    st.textContent = await (await fetch(link.href)).text();
    link.replaceWith(st);
  }
  clone.querySelectorAll('link').forEach(l => l.remove());
  // form values live in properties, not in markup: copy them over
  const src = [...document.querySelectorAll('textarea,input,select')], dst = [...clone.querySelectorAll('textarea,input,select')];
  src.forEach((e, k) => {
    if (e.tagName === 'TEXTAREA') dst[k].textContent = e.value;
    else if (e.tagName === 'INPUT') { dst[k].setAttribute('value', e.value); if (e.checked) dst[k].setAttribute('checked', ''); }
  });
  // scroll offsets are not part of the markup either: shift the content of scrolled boxes instead
  const all = [...document.querySelectorAll('*')], twins = [...clone.querySelectorAll('*')];
  all.forEach((e, k) => {
    if (e.scrollTop > 0 && twins[k] && twins[k].firstElementChild) {
      twins[k].style.overflow = 'hidden';
      twins[k].firstElementChild.style.marginTop = (parseFloat(getComputedStyle(e.firstElementChild).marginTop) - e.scrollTop) + 'px';
    }
  });
  // inside an image viewport units and the system colour scheme are not those of the page: pin the current values
  const st = document.createElement('style');
  // an image restarts CSS animations from their first frame: show the final state instead
  st.textContent = `html,body,#root{height:${H}px;width:${W}px;overflow:hidden}.te-shell{height:${H}px!important}*,*::before,*::after{animation:none!important;transition:none!important}`;
  clone.querySelector('head').append(st);
  clone.querySelectorAll('[style*="vh"],[style*="vw"]').forEach(e => {
    e.setAttribute('style', e.getAttribute('style').replace(/([\d.]+)vh/g, (_, v) => (v * H / 100) + 'px').replace(/([\d.]+)vw/g, (_, v) => (v * W / 100) + 'px'));
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}">` +
    `<foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const img = new Image();
  await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('svg load failed')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const cv = document.createElement('canvas'); cv.width = W * scale; cv.height = H * scale;
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  await fetch('http://localhost:8099/' + name, { method: 'POST', mode: 'no-cors', body: blob });
  return blob.size;
};
