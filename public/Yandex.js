/*
 * L.Yandex - адаптер для отображения слоев Яндекс.Карт в Leaflet
 */
L.Yandex = L.Layer.extend({
    includes: L.Evented,
    options: {
        type: 'yandex#satellite', // Тип по умолчанию (спутник)
        mapOptions: {
            checkZoomRange: true
        }
    },

    initialize: function(type, options) {
        L.setOptions(this, options);
        if (typeof type === 'string') {
            this.options.type = 'yandex#' + type;
        }
    },

    onAdd: function(map) {
        this._map = map;
        if (!this._container) {
            this._initContainer();
        }
        map._container.appendChild(this._container);
        if (!this._yandex) {
            this._initApi();
        } else {
            this._update();
        }
    },

    onRemove: function(map) {
        map._container.removeChild(this._container);
    },

    _initContainer: function() {
        var _container = this._container = L.DomUtil.create('div', 'leaflet-yandex-layer');
        _container.id = '_YandexContainer_' + L.stamp(this);
        _container.style.zIndex = 'auto';
        _container.style.width = '100%';
        _container.style.height = '100%';
        _container.style.position = 'absolute';
        _container.style.top = 0;
        _container.style.left = 0;
    },

    _initApi: function() {
        var self = this;
        ymaps.ready(function() {
            self._yandex = new ymaps.Map(self._container, {
                center: [self._map.getCenter().lat, self._map.getCenter().lng],
                zoom: self._map.getZoom(),
                behaviors: [],
                controls: [],
                type: self.options.type
            }, self.options.mapOptions);
            
            self._update();
            self._map.on('move', self._update, self);
        });
    },

    _update: function() {
        if (!this._yandex) return;
        var center = this._map.getCenter();
        this._yandex.setCenter([center.lat, center.lng]);
        this._yandex.setZoom(this._map.getZoom());
    }
});

