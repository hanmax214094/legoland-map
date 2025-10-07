const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

createApp({
    setup() {
        const mapElement = ref(null);
        const menuModalRef = ref(null);
        const menuCloseRef = ref(null);
        const menuBodyRef = ref(null);
        const state = reactive({
            map: null,
            marker: null,
            userLocationMarker: null,
            isMobile: window.innerWidth <= 768,
            isListOpen: false,
            searchTerm: '',
            selectedZone: '全部',
            categories: [],
            filterZones: ['全部'],
            menuModalVisible: false,
            activeMenuFacility: null,
            activeFacilityId: null,
            activeLocationId: null
        });
        const previousFocusedElement = ref(null);
        const hasFallbackAttempted = ref(false);

        const locateOptions = {
            setView: true,
            maxZoom: 16,
            enableHighAccuracy: true,
            timeout: 15000
        };

        const zoneMap = {
            '1': 'BRICK STREET',
            '2': 'BRICKTOPIA',
            '3': 'LEGO Castle',
            '4': 'LEGO NINJAGO',
            '5': 'PIRATE SHORES',
            '6': 'LEGO CITY',
            '7': 'MINILAND'
        };

        const zoneClassMap = {
            'BRICK STREET': 'zone-gf',
            'BRICKTOPIA': 'zone-aa',
            'LEGO Castle': 'zone-ml',
            'LEGO NINJAGO': 'zone-ea',
            'PIRATE SHORES': 'zone-zt',
            'LEGO CITY': 'zone-zt',
            'MINILAND': 'zone-zt'
        };

        const categorySortOrder = [
            'BRICK STREET',
            'BRICKTOPIA',
            'LEGO Castle',
            'LEGO NINJAGO',
            'PIRATE SHORES',
            'LEGO CITY',
            'MINILAND'
        ];

        const isIOSDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        const visibleCategories = computed(() => {
            const selected = state.selectedZone;
            return state.categories.filter(category => {
                const zoneMatch = selected === '全部' || category.name === selected;
                return zoneMatch && category.visible;
            });
        });

        const isFiltering = computed(() => {
            return state.searchTerm.trim().length > 0 || state.selectedZone !== '全部';
        });

        const refreshMapSize = () => {
            requestAnimationFrame(() => {
                state.map?.invalidateSize();
            });
        };

        const resetDesktopState = () => {
            state.isListOpen = false;
            document.body.classList.remove('list-open');
        };

        const applyMobileState = (open) => {
            state.isListOpen = open;
            document.body.classList.toggle('list-open', open);
            refreshMapSize();
        };

        const closeList = () => {
            if (!state.isMobile) return;
            state.isListOpen = false;
        };

        const openListOnMobile = () => {
            if (state.isMobile) {
                state.isListOpen = true;
            }
        };

        const toggleList = () => {
            if (!state.isMobile) return;
            state.isListOpen = !state.isListOpen;
        };

        const selectZone = (zone) => {
            state.selectedZone = zone;
            if (state.isMobile) {
                state.isListOpen = true;
            }
        };

        const getTrimmedText = (value) => (typeof value === 'string' ? value.trim() : '');

        const formatMenuName = (menuItem) => {
            const chineseName = getTrimmedText(menuItem?.menuDescrtCN);
            const englishName = getTrimmedText(menuItem?.menuDescrtEng);
            const koreanName = getTrimmedText(menuItem?.menuDescrt);
            return chineseName || englishName || koreanName || '餐點';
        };

        const formatMenuKoreanName = (menuItem) => {
            const koreanName = getTrimmedText(menuItem?.menuDescrt);
            const mainName = formatMenuName(menuItem);
            return koreanName && koreanName !== mainName ? koreanName : '';
        };

        const formatMenuSubtitle = (menuItem) => {
            const englishName = getTrimmedText(menuItem?.menuDescrtEng);
            const mainName = formatMenuName(menuItem);
            return englishName && englishName !== mainName ? englishName : '';
        };

        const formatMenuPrice = (price) => {
            if (typeof price !== 'number' || Number.isNaN(price)) return '';
            return price.toLocaleString('zh-TW');
        };

        const processData = (facilities) => {
            const grouped = {};
            const zones = new Set(['全部']);
            let idCounter = 0;

            facilities.forEach(facility => {
                if (!facility.locList || facility.locList.length === 0) return;
                const categoryName = zoneMap[facility.zoneKindCd] || '其他';
                zones.add(categoryName);
                if (!grouped[categoryName]) {
                    grouped[categoryName] = {};
                }

                const displayName = `${facility.faciltNameCN}/${facility.faciltNameEng} (${facility.faciltName})`;
                const sanitizedMenu = Array.isArray(facility.menuList)
                    ? facility.menuList
                        .filter(item => item && (item.menuDescrtCN || item.menuDescrtEng || item.menuDescrt))
                        .map((item, menuIndex) => ({ ...item, id: `${facility.faciltId || facility.id || 'menu'}-${menuIndex}` }))
                    : [];
                const hasMenuData = sanitizedMenu.length > 0;

                if (!grouped[categoryName][displayName]) {
                    grouped[categoryName][displayName] = {
                        id: `facility-${idCounter++}`,
                        name: displayName,
                        nameLower: displayName.toLowerCase(),
                        isRestaurant: facility.faciltCateKindCd === '04',
                        hasMenu: facility.faciltCateKindCd === '04' && hasMenuData,
                        menuList: hasMenuData ? sanitizedMenu : [],
                        locations: [],
                        visibleLocations: [],
                        visible: true,
                        showSublist: false,
                        zoneClass: zoneClassMap[categoryName] || ''
                    };
                } else if (facility.faciltCateKindCd === '04') {
                    grouped[categoryName][displayName].isRestaurant = true;
                    if (hasMenuData) {
                        grouped[categoryName][displayName].menuList = sanitizedMenu;
                        grouped[categoryName][displayName].hasMenu = true;
                    }
                }

                facility.locList.forEach((loc, index) => {
                    const lat = parseFloat(loc.latud);
                    const lng = parseFloat(loc.lgtud);
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                    const label = facility.locList.length > 1 ? `地點 ${index + 1}` : displayName;
                    grouped[categoryName][displayName].locations.push({
                        id: `${grouped[categoryName][displayName].id}-loc-${index}`,
                        lat,
                        lng,
                        label,
                        fullNameLower: `${displayName} ${label}`.toLowerCase(),
                        visible: true
                    });
                });
            });

            const result = Object.keys(grouped)
                .sort((a, b) => {
                    const orderA = categorySortOrder.indexOf(a);
                    const orderB = categorySortOrder.indexOf(b);
                    return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
                })
                .map(categoryName => {
                    const facilitiesList = Object.values(grouped[categoryName]).sort((a, b) =>
                        a.name.localeCompare(b.name, 'zh-Hant')
                    );

                    const restaurantFacilities = facilitiesList.filter(facility => facility.isRestaurant);
                    const otherFacilities = facilitiesList.filter(facility => !facility.isRestaurant);
                    const facilitiesWithGrouping = [];

                    if (restaurantFacilities.length > 0) {
                        facilitiesWithGrouping.push({
                            id: `category-${categoryName}-restaurants`,
                            name: '餐廳',
                            nameLower: '餐廳',
                            isGroup: true,
                            hasMenu: false,
                            menuList: [],
                            locations: [],
                            visibleLocations: [],
                            visible: true,
                            showSublist: false,
                            zoneClass: zoneClassMap[categoryName] || '',
                            childFacilities: restaurantFacilities,
                            visibleChildFacilities: restaurantFacilities
                        });
                    }

                    facilitiesWithGrouping.push(...otherFacilities);

                    return {
                        name: categoryName,
                        zoneClass: zoneClassMap[categoryName] || '',
                        facilities: facilitiesWithGrouping,
                        visibleFacilities: facilitiesWithGrouping,
                        visible: true,
                        isCollapsed: false
                    };
                });

            state.filterZones = Array.from(zones).sort((a, b) => {
                if (a === '全部') return -1;
                if (b === '全部') return 1;
                const orderA = categorySortOrder.indexOf(a);
                const orderB = categorySortOrder.indexOf(b);
                return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB);
            });

            return result;
        };

        const updateVisibility = () => {
            const term = state.searchTerm.trim().toLowerCase();
            state.categories.forEach(category => {
                let hasVisibleFacility = false;
                category.facilities.forEach(facility => {
                    if (facility.isGroup) {
                        let hasVisibleChild = false;

                        facility.childFacilities.forEach(childFacility => {
                            const childNameMatch = childFacility.nameLower.includes(term);
                            let childLocationMatch = false;

                            childFacility.locations.forEach(location => {
                                const locationMatches = term ? location.fullNameLower.includes(term) : true;
                                location.visible = locationMatches;
                                if (locationMatches && term) {
                                    childLocationMatch = true;
                                }
                            });

                            childFacility.visible = term ? (childNameMatch || childLocationMatch) : true;
                            childFacility.visibleLocations = childFacility.locations.filter(loc => loc.visible);

                            if (term && childLocationMatch) {
                                childFacility.showSublist = true;
                            } else if (!term && childFacility.locations.length <= 1) {
                                childFacility.showSublist = false;
                            }

                            hasVisibleChild = hasVisibleChild || childFacility.visible;
                        });

                        facility.visibleChildFacilities = facility.childFacilities.filter(child => child.visible);
                        facility.visible = facility.visibleChildFacilities.length > 0;
                        if (!facility.visible) {
                            facility.showSublist = false;
                        } else if (term) {
                            facility.showSublist = true;
                        }

                        hasVisibleFacility = hasVisibleFacility || facility.visible;
                    } else {
                        const nameMatch = facility.nameLower.includes(term);
                        let locationMatch = false;

                        facility.locations.forEach(location => {
                            const locationMatches = term ? location.fullNameLower.includes(term) : true;
                            location.visible = locationMatches;
                            if (locationMatches && term) {
                                locationMatch = true;
                            }
                        });

                        facility.visible = term ? (nameMatch || locationMatch) : true;
                        facility.visibleLocations = facility.locations.filter(loc => loc.visible);

                        if (term && locationMatch) {
                            facility.showSublist = true;
                        } else if (!term && facility.locations.length <= 1) {
                            facility.showSublist = false;
                        }

                        hasVisibleFacility = hasVisibleFacility || facility.visible;
                    }
                });

                category.visibleFacilities = category.facilities.filter(fac => fac.visible);
                category.visible = category.visibleFacilities.length > 0;
                if (term && category.visible) {
                    category.isCollapsed = false;
                }
            });

            const activeFacilityStillVisible = state.categories.some(category =>
                category.visibleFacilities.some(facility => facility.id === state.activeFacilityId)
            );

            if (!activeFacilityStillVisible) {
                state.activeFacilityId = null;
                state.activeLocationId = null;
            }
        };

        const focusLocation = (facility, location) => {
            if (!location) return;
            const latLng = [location.lat, location.lng];
            if (!state.map) return;
            if (state.marker) {
                state.map.removeLayer(state.marker);
            }
            state.map.setView(latLng, 18);
            const popupName = facility.locations.length > 1
                ? `${facility.name} - ${location.label}`
                : facility.name;
            state.marker = L.marker(latLng).addTo(state.map).bindPopup(popupName).openPopup();
            state.activeFacilityId = facility.id;
            state.activeLocationId = location?.id || null;
            if (state.isMobile) {
                state.isListOpen = false;
            }
        };

        const handleFacilityClick = (facility) => {
            if (facility.isGroup) {
                facility.showSublist = !facility.showSublist;
                return;
            }

            if (facility.locations.length > 1) {
                facility.showSublist = !facility.showSublist;
                state.activeFacilityId = facility.id;
                state.activeLocationId = null;
                return;
            }
            const location = facility.visibleLocations[0] || facility.locations[0];
            focusLocation(facility, location);
        };

        const handleFacilityKey = (facility) => {
            handleFacilityClick(facility);
        };

        const handleNestedFacilityClick = (group, facility) => {
            if (facility.locations.length > 1) {
                facility.showSublist = !facility.showSublist;
                state.activeFacilityId = facility.id;
                state.activeLocationId = null;
                if (!group.showSublist) {
                    group.showSublist = true;
                }
                return;
            }
            const location = facility.visibleLocations[0] || facility.locations[0];
            focusLocation(facility, location);
        };

        const handleNestedFacilityKey = (group, facility) => {
            handleNestedFacilityClick(group, facility);
        };

        const openMenu = (facility) => {
            if (!facility?.hasMenu) return;
            previousFocusedElement.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            state.activeMenuFacility = facility;
            state.menuModalVisible = true;
            state.activeFacilityId = facility.id;
            state.activeLocationId = null;
            nextTick(() => {
                menuBodyRef.value?.scrollTo({ top: 0 });
                menuCloseRef.value?.focus({ preventScroll: true });
            });
        };

        const closeMenu = () => {
            if (!state.menuModalVisible) return;
            state.menuModalVisible = false;
            const target = previousFocusedElement.value;
            if (target && typeof target.focus === 'function') {
                target.focus({ preventScroll: true });
            }
        };

        const showUserLocation = (latlng, accuracy = 0) => {
            if (!state.map) return;
            const normalizedAccuracy = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0;
            const radius = normalizedAccuracy / 2;
            const circleRadius = radius || 25;
            const popupMessage = radius
                ? `您在這裡 (誤差約 ${radius.toFixed(0)} 公尺)`
                : '您在這裡';

            if (state.userLocationMarker) state.map.removeLayer(state.userLocationMarker);
            state.userLocationMarker = L.circle(latlng, circleRadius, {
                color: '#2c7be5',
                fillColor: '#60a5fa',
                fillOpacity: 0.25
            }).addTo(state.map);
            state.userLocationMarker.bindPopup(popupMessage).openPopup();
        };

        const handleGeolocationSuccess = (position) => {
            const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
            const accuracy = position.coords.accuracy ?? 0;
            showUserLocation(latlng, accuracy);
            if (locateOptions.setView && state.map) {
                const targetZoom = locateOptions.maxZoom ?? state.map.getZoom();
                state.map.setView(latlng, targetZoom);
            }
        };

        const getLocationErrorMessage = (code, isFallback = false) => {
            const PERMISSION_DENIED = 1;
            const POSITION_UNAVAILABLE = 2;
            const TIMEOUT = 3;
            let message = '無法取得您的位置。';

            switch (code) {
                case PERMISSION_DENIED:
                    message = isIOSDevice()
                        ? '請在「設定 > Safari > 位置」允許此網站使用定位功能，或在頁面重新載入後允許定位權限。'
                        : '請允許此網站使用定位功能。';
                    break;
                case POSITION_UNAVAILABLE:
                    message = isFallback
                        ? '目前無法透過裝置的定位服務取得位置，請確認裝置有良好訊號並已開啟定位功能。'
                        : '目前的定位服務不可用，請確認已開啟定位或稍後再試。';
                    break;
                case TIMEOUT:
                    message = '定位逾時，請確認定位服務狀態後再試一次。';
                    break;
                default:
                    break;
            }

            return message;
        };

        const attemptFallbackGeolocation = (originalError) => {
            if (hasFallbackAttempted.value || !navigator.geolocation) {
                alert(`定位錯誤：${getLocationErrorMessage(originalError.code)}`);
                return;
            }

            hasFallbackAttempted.value = true;
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    handleGeolocationSuccess(position);
                },
                (fallbackError) => {
                    alert(`定位錯誤：${getLocationErrorMessage(fallbackError.code, true)}`);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 0
                }
            );
        };

        const handleLocate = () => {
            hasFallbackAttempted.value = false;
            if (navigator.geolocation && isIOSDevice()) {
                navigator.geolocation.getCurrentPosition(
                    handleGeolocationSuccess,
                    (error) => {
                        alert(`定位錯誤：${getLocationErrorMessage(error.code)}`);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 20000,
                        maximumAge: 0
                    }
                );
                if (state.isMobile) {
                    state.isListOpen = false;
                }
                return;
            }
            state.map?.locate(locateOptions);
            if (state.isMobile) {
                state.isListOpen = false;
            }
        };

        const resetFilters = () => {
            state.searchTerm = '';
            state.selectedZone = '全部';
            updateVisibility();
        };

        const initializeMap = () => {
            if (!mapElement.value) return;
            L.Icon.Default.imagePath = 'vendor/leaflet/images/';
            state.map = L.map(mapElement.value, {
                attributionControl: false
            }).setView([37.884964932893915, 127.697034892803], 15);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(state.map);

            const attributionControl = L.control.attribution({
                position: state.isMobile ? 'topright' : 'bottomright'
            }).addTo(state.map);

            const updateAttributionPosition = () => {
                attributionControl.setPosition(state.isMobile ? 'topright' : 'bottomright');
            };

            const LocateControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: () => {
                    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom leaflet-control-locate');
                    container.innerHTML = '<a href="#" title="我的位置"></a>';
                    container.onclick = (e) => {
                        e.preventDefault();
                        handleLocate();
                    };
                    return container;
                }
            });

            state.map.addControl(new LocateControl());

            state.map.on('locationfound', (event) => {
                showUserLocation(event.latlng, event.accuracy);
            });

            state.map.on('locationerror', (event) => {
                attemptFallbackGeolocation(event);
            });

            const handleResize = () => {
                const currentlyMobile = window.innerWidth <= 768;
                if (currentlyMobile !== state.isMobile) {
                    state.isMobile = currentlyMobile;
                    if (currentlyMobile) {
                        applyMobileState(false);
                    } else {
                        resetDesktopState();
                    }
                    updateVisibility();
                }
                if (!currentlyMobile) {
                    updateVisibility();
                }
                updateAttributionPosition();
                refreshMapSize();
            };

            window.addEventListener('resize', handleResize);
        };

        const fetchFacilities = () => {
            fetch('./all_facilt.json')
                .then(response => response.json())
                .then(data => {
                    state.categories = processData(data);
                    updateVisibility();
                })
                .catch(error => {
                    console.error('Error fetching data:', error);
                });
        };

        watch(() => state.searchTerm, () => {
            updateVisibility();
            if (state.isMobile && state.searchTerm) {
                state.isListOpen = true;
            }
        });

        watch(() => state.isListOpen, (open) => {
            if (!state.isMobile) return;
            document.body.classList.toggle('list-open', open);
            refreshMapSize();
        });

        watch(() => state.menuModalVisible, (visible) => {
            document.body.classList.toggle('menu-modal-open', visible);
        });

        onMounted(() => {
            initializeMap();
            fetchFacilities();
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    if (state.menuModalVisible) {
                        event.preventDefault();
                        closeMenu();
                        return;
                    }
                    if (state.isMobile && state.isListOpen) {
                        event.preventDefault();
                        closeList();
                    }
                }
            });
        });

        return {
            mapElement,
            menuModalRef,
            menuCloseRef,
            menuBodyRef,
            state,
            visibleCategories,
            isFiltering,
            searchTerm: refProxy(state, 'searchTerm'),
            selectedZone: refProxy(state, 'selectedZone'),
            isMobile: refProxy(state, 'isMobile'),
            isListOpen: refProxy(state, 'isListOpen'),
            menuModalVisible: refProxy(state, 'menuModalVisible'),
            activeMenuFacility: refProxy(state, 'activeMenuFacility'),
            filterZones: refProxy(state, 'filterZones'),
            activeFacilityId: refProxy(state, 'activeFacilityId'),
            activeLocationId: refProxy(state, 'activeLocationId'),
            handleLocate,
            toggleList,
            closeList,
            openListOnMobile,
            toggleCategory: (category) => {
                category.isCollapsed = !category.isCollapsed;
            },
            handleFacilityClick,
            handleFacilityKey,
            handleNestedFacilityClick,
            handleNestedFacilityKey,
            focusLocation,
            openMenu,
            closeMenu,
            selectZone,
            formatMenuName,
            formatMenuKoreanName,
            formatMenuSubtitle,
            formatMenuPrice,
            resetFilters,
            zoneClassMap
        };
    }
}).mount('#app');

function refProxy(state, key) {
    return computed({
        get: () => state[key],
        set: (value) => {
            state[key] = value;
        }
    });
}
