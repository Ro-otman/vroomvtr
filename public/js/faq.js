(() => {
const items = document.querySelectorAll('.faq-item');
const buttons = document.querySelectorAll('.faq-question');
const cats = document.querySelectorAll('.cat');

buttons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    if (!item) return;
    item.classList.toggle('open');
  });
});

cats.forEach((cat) => {
  cat.addEventListener('click', () => {
    const filter = cat.dataset.filter;
    cats.forEach((c) => c.classList.remove('active'));
    cat.classList.add('active');

    items.forEach((item) => {
      const category = item.dataset.category;
      if (filter === 'all' || category === filter) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  });
});
})();

