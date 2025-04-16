document.addEventListener('DOMContentLoaded', () => {
    fetch('data.txt')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok.');
            }
            return response.text();
        })
        .then(data => {
            const items = data.split('\n\n').map(item => {
                const lines = item.split('\n').filter(line => line.trim() !== '');
                if (lines.length < 2) {
                    throw new Error('Malformed data: each item must have a title and content.');
                }
                const [title, ...content] = lines;
                return { title: title.trim(), content: content.join('\n').trim() };
            });

            const accordion = document.getElementById('accordion');
            items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.classList.add('accordion-item');

                const titleDiv = document.createElement('div');
                titleDiv.classList.add('accordion-title');
                titleDiv.textContent = item.title;
                titleDiv.onclick = () => {
                    const contentDiv = itemDiv.querySelector('.accordion-content');
                    contentDiv.style.display = contentDiv.style.display === 'block' ? 'none' : 'block';
                };

                const contentDiv = document.createElement('div');
                contentDiv.classList.add('accordion-content');
                contentDiv.textContent = item.content;

                itemDiv.appendChild(titleDiv);
                itemDiv.appendChild(contentDiv);
                accordion.appendChild(itemDiv);
            });
        })
        .catch(error => {
            const accordion = document.getElementById('accordion');
            const errorMessage = document.createElement('div');
            errorMessage.textContent = `Error loading data: ${error.message}`;
            errorMessage.style.color = 'red';
            errorMessage.style.padding = '15px';
            errorMessage.style.backgroundColor = '#f8d7da';
            errorMessage.style.border = '1px solid #f5c6cb';
            accordion.appendChild(errorMessage);
            console.error('Error loading the data:', error);
        });
});