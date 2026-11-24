document.addEventListener('click', async (event) => {
  const button = event.target.closest('.goods-copy');
  if (!button) return;
  const details = button.closest('details');
  const spec = details.querySelector('.goods-spec');
  const feedback = details.querySelector('.goods-feedback');
  try {
    await navigator.clipboard.writeText(spec.textContent);
    feedback.textContent = '规格已复制';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(spec);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    feedback.textContent = '已选中规格，可用系统复制';
  }
});
