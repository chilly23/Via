document.getElementById('set-source-btn').addEventListener('click', function () {
            isSettingSource = true;
            isSettingDestination = false;
        });

        document.getElementById('set-destination-btn').addEventListener('click', function () {
            isSettingSource = false;
            isSettingDestination = true;
        });

        document.getElementsByClassName('location-button')[0].addEventListener('click', function () {
            map.setView(userCoords, 15);
        });