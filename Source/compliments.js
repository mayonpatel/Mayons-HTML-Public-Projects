function getCompliment() {
  fetch('https://raw.githubusercontent.com/mayonpatel/Mayons-HTML-Public-Projects/refs/heads/main/Source/complimentslist.json')
    .then(response => response.json())
    .then(data => {
      const compliment = data.compliments[Math.floor(Math.random() * data.compliments.length)];
      document.getElementById('displayBack').innerText = compliment;
    })
    .catch(error => {
      console.error('Error fetching compliment:', error);
      document.getElementById('displayBack').innerText = "Sorry, couldn't fetch a compliment.";
    });
}
