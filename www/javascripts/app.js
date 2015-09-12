/*global $, window, L, fullscreen */

import io from 'socket.io-client';

(function () {
    'use strict';

    var doc = $(document),
        socket = io('http://localhost:3001');

    socket.on('news', function (data) {
        console.log(data);
        socket.emit('my other event', { my: 'data' });
    });

    doc.on('click', '.fullscreen-anchor', function (e) {
        e.preventDefault();
        e.stopPropagation();

        fullscreen(
            document.getElementById($(this).data('fullscreen'))
        );
    });

    function initMap() {
        var map = L.map('map').setView([51.505, -0.09], 13),
            popup = L.popup();

        L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6IjZjNmRjNzk3ZmE2MTcwOTEwMGY0MzU3YjUzOWFmNWZhIn0.Y8bhBaUMqFiPrDRW9hieoQ', {
            maxZoom: 18,
            attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
                '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery © <a href="http://mapbox.com">Mapbox</a>',
            id: 'mapbox.streets'
        }).addTo(map);

        L.circle([51.508, -0.11], 50, {
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.5
        }).addTo(map).bindPopup("I am a circle.");

        function onMapClick(e) {
            popup
                .setLatLng(e.latlng)
                .setContent("You clicked the map at " + e.latlng.toString())
                .openOn(map);
        }

        map.on('click', onMapClick);
    }


    $(function () {
        initMap();
    });
}());
