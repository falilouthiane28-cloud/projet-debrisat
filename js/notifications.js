// Systeme de notifications Debrisat
window.debrisat.notifications = {
    init() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    },

    envoyer(titre, message, icone = '🛡️') {
        window.debrisat.utils.toast(message, 'info');
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(titre, { body: message, icon: icone });
        }
    }
};
