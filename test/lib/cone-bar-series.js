//import echarts from '../../node_modules/echarts/dist/echarts.js';
//import '../../dist/echarts-gl.js';

// ----- 사용자 설정 ----- 
const CONFIG = {
    // 3D 바 관련 설정
    bar: {
        maxCount: 100,     // 최대 생성 개수
        height: 3,          // 기본 높이
        size: 1,          // 바 크기 (직경)
        color: '#4b9eff',   // 색상
        opacity: 0.8        // 불투명도
    },
    // 원뿔 관련 설정
    cone: {
        maxCount: 50,   // 최대 생성 개수
        height: 5,          // 높이
        radius: 2,        // 바닥 반지름
        segments: 10,       // 세그먼트 수
        color: '#cd2990',   // 색상
        opacity: 0.6        // 불투명도
    },
    // 공통 설정
    grid: {
        radius: 100,         // 그리드 반지름
        floorColor: '#333', // 바닥 색상
        floorOpacity: 0.4   // 바닥 불투명도
    },
    // 애니메이션 설정
    animation: false         // 애니메이션 활성화 여부
};
const DEFAULT_BAR_COUNT = CONFIG.bar.maxCount // 기본 바 개수
const DEFAULT_CONE_COUNT = CONFIG.cone.maxCount // 기본 원뿔 개수

// 차트 초기화
const chartDom = document.getElementById('main');
const myChart = echarts.init(chartDom);

/**
 * 원형 경계 내 좌표 생성 함수
 * @param {number} maxCount 최대 데이터 개수
 * @param {number} gridRadius 그리드 반지름
 * @returns {Object} 생성된 좌표와 관련 정보
 */
function generateCircularCoordinates(maxCount, gridRadius) {
    // 원의 넓이를 기반으로 점 사이의 간격 계산
    const totalArea = Math.PI * gridRadius * gridRadius;
    const pointArea = totalArea / maxCount;
    const pointSpacing = Math.sqrt(pointArea);
    
    // 좌표 배열
    const coordinates = [];
    
    // 원 내부 좌표 생성
    const xRange = Math.ceil(gridRadius * 2);
    const yRange = Math.ceil(gridRadius * 2);
    
    for (let x = -xRange; x <= xRange; x += pointSpacing) {
        for (let y = -yRange; y <= yRange; y += pointSpacing) {
            // 원 중심으로부터의 거리 계산
            const distance = Math.sqrt(x * x + y * y);
            
            // 반지름 이내의 좌표만 사용
            if (distance <= gridRadius && coordinates.length < maxCount) {
                coordinates.push({ x, y, distance });
            }
        }
    }
    
    return {
        coordinates,
        count: coordinates.length,
        bounds: {
            xMin: -gridRadius,
            xMax: gridRadius,
            yMin: -gridRadius,
            yMax: gridRadius,
            radius: gridRadius
        }
    };
}

/**
 * 원형 바닥 그리드 생성 함수
 * @returns {Object} 바닥 그리드 시리즈 객체
 */
function createFloorGrid() {
    const radius = CONFIG.grid.radius;
    const segments = 60;
    
    // 원형 표면 생성
    return {
        type: 'surface',
        name: 'floor',
        silent: true, // 이벤트 무시
        parametric: true,
        parametricEquation: {
            u: {
                min: 0,
                max: Math.PI * 2,
                step: Math.PI * 2 / segments
            },
            v: {
                min: 0,
                max: 1,
                step: 1 / 20
            },
            x: function (u, v) {
                return radius * v * Math.cos(u);
            },
            y: function (u, v) {
                return radius * v * Math.sin(u);
            },
            z: function () {
                return 0; // 바닥 z = 0
            }
        },
        wireframe: {
            show: true,
            width: 1.5,
            color: '#555'
        },
        itemStyle: {
            color: CONFIG.grid.floorColor,
            opacity: CONFIG.grid.floorOpacity
        },
        // 격자선 추가
        axisLine: {
            show: true,
            lineStyle: {
                color: '#fff'
            }
        }
    };
}

/**
 * 3D 바 시리즈 생성 함수
 * @returns {Array} 3D 바 시리즈 배열
 */
function create3DBarSeries() {
    // 좌표 생성
    const { coordinates } = generateCircularCoordinates(
        CONFIG.bar.maxCount, 
        CONFIG.grid.radius
    );
    
    // 바 데이터 생성
    const barData = coordinates.map(pos => ({
        value: [pos.x, pos.y, CONFIG.bar.height],
        itemStyle: {
            color: CONFIG.bar.color,
            opacity: CONFIG.bar.opacity
        }
    }));
    
    // 시리즈 배열 생성
    return [
        {
            type: 'bar3D',
            name: '3D Bars',
            data: barData,
            barSize: CONFIG.bar.size,
            bevelSize: 0,
            minHeight: 0,
            shading: 'realistic',
            animation: CONFIG.animation,
            label: {
                show: false
            },
            emphasis: {
                itemStyle: {
                    color: '#ff9800'
                }
            },
            // 최적화
            progressive: 1000,
            progressiveThreshold: 5000
        }
    ];
}

/**
 * 원뿔 시리즈 생성 함수
 * @returns {Array} 원뿔 시리즈 배열
 */
function createConeSeries() {
    // 좌표 생성
    const { coordinates } = generateCircularCoordinates(
        CONFIG.cone.maxCount, 
        CONFIG.grid.radius
    );
    const series = [];
    
    // 원뿔 추가
    for (let i = 0; i < coordinates.length; i++) {
        const pos = coordinates[i];
        
        // 원뿔 측면 추가
        series.push(createConeSide(pos, i));
        
        // 원뿔 바닥 추가
        //series.push(createConeBase(pos, i));
    }
    
    return series;
}

/**
 * 원뿔 측면 생성 함수
 * @param {Object} pos - 위치 {x, y}
 * @param {number} index - 원뿔 인덱스
 * @returns {Object} 원뿔 측면 시리즈 객체
 */
function createConeSide(pos, index) {
    return {
        type: 'surface',
        name: `cone-side-${index}`,
        parametric: true,
        parametricEquation: {
            u: {
                min: 0,
                max: Math.PI * 2,
                step: Math.PI * 2 / CONFIG.cone.segments
            },
            v: {
                min: 0,
                max: 1,
                step: 1
            },
            x: function (u, v) {
                return pos.x + CONFIG.cone.radius * v * Math.cos(u);
            },
            y: function (u, v) {
                return pos.y + CONFIG.cone.radius * v * Math.sin(u);
            },
            z: function (_, v) {
                return CONFIG.cone.height * (1 - v);
            }
        },
        itemStyle: {
            color: CONFIG.cone.color,
            opacity: CONFIG.cone.opacity
        },
        wireframe: {
            show: false,
        },
        shading: 'color',
        animation: CONFIG.animation,
        // 최적화
        progressive: 2000,
        progressiveThreshold: 10000,
        // 원뿔 정보 저장
        coneInfo: {
            index: index,
            position: pos,
            radius: CONFIG.cone.radius
        }
    };
}

/**
 * 원뿔 바닥 생성 함수
 * @param {Object} pos - 위치 {x, y}
 * @param {number} index - 원뿔 인덱스
 * @returns {Object} 원뿔 바닥 시리즈 객체
 */
function createConeBase(pos, index) {
    return {
        type: 'surface',
        name: `cone-base-${index}`,
        parametric: true,
        parametricEquation: {
            u: {
                min: 0,
                max: Math.PI * 2,
                step: Math.PI * 2 / CONFIG.cone.segments
            },
            v: {
                min: 1,
                max: 1,
                step: 1
            },
            x: function (u, v) {
                return pos.x + CONFIG.cone.radius * v * Math.cos(u);
            },
            y: function (u, v) {
                return pos.y + CONFIG.cone.radius * v * Math.sin(u);
            },
            z: function () {
                return 0; // 바닥은 항상 z=0
            }
        },
        itemStyle: {
            color: CONFIG.cone.color,
            opacity: CONFIG.cone.opacity
        },
        wireframe: {
            show: false
        },
        shading: 'color',
        animation: CONFIG.animation,
        // 최적화
        progressive: 2000,
        progressiveThreshold: 10000,
        // 원뿔 정보 저장
        coneInfo: {
            index: index,
            position: pos,
            radius: CONFIG.cone.radius
        }
    };
}

/**
 * 3D 바와 원뿔을 동시에 렌더링하는 함수
 * @returns {Array} 시리즈 배열
 */
function createCombinedSeries() {
    // 바닥 그리드 추가
    const series = [createFloorGrid()];
    series.push(...create3DBarSeries()); // 바 시리즈 추가
    series.push(...createConeSeries()); // 원뿔 시리즈 추가
    
    return series;
}

// ----- 차트 옵션 설정 -----
/**
 * 기본 차트 옵션 생성
 * @returns {Object} 차트 옵션 객체
 */
function createBaseOption() {
    return {
        title: {
            text: '3D Circular Grid Visualization',
            left: 'center',
            top: 10,
            textStyle: {
                color: '#fff'
            }
        },
        tooltip: {},
        xAxis3D: {
            type: 'value',
            min: -CONFIG.grid.radius * 1.2,
            max: CONFIG.grid.radius * 1.2,
            axisLine: {
                lineStyle: { color: '#fff' }
            }
        },
        yAxis3D: {
            type: 'value',
            min: -CONFIG.grid.radius * 1.2,
            max: CONFIG.grid.radius * 1.2,
            axisLine: {
                lineStyle: { color: '#fff' }
            }
        },
        zAxis3D: {
            type: 'value',
            min: 0,
            max: Math.max(CONFIG.bar.height, CONFIG.cone.height) * 1.2,
            axisLine: {
                lineStyle: { color: '#fff' }
            }
        },
        grid3D: {
            environment: '#000',
            boxHeight: Math.max(CONFIG.bar.height, CONFIG.cone.height) * 1.5,
            boxDepth: CONFIG.grid.radius * 2.5,
            boxWidth: CONFIG.grid.radius * 2.5,
            floor: {
                show: false,
            },
            axisLine: {
                lineStyle: { color: '#fff' }
            },
            axisPointer: {
                lineStyle: { color: '#fff' }
            },
            viewControl: {
                projection: 'perspective',
                distance: CONFIG.grid.radius * 3.5,
                orthographicSize: CONFIG.grid.radius * 1.5,
                panSensitivity: 0.5,
                zoomSensitivity: 0.5,
                // 초기 시점 설정
                alpha: 40,
                beta: 30
            },
            temporalSuperSampling: {
                enable: true
            },
            postEffect: { 
                enable: false 
            },
            light: {
                main: {
                    intensity: 1.2,
                    shadow: true
                },
                ambient: { 
                    intensity: 0.3 
                }
            }
        }
    };
}

// 초기 옵션 설정
let option = {
    ...createBaseOption(),
    series: createCombinedSeries()
};

// 차트 초기화
myChart.setOption(option);

// 클릭 이벤트 리스너 추가
myChart.on('click', function (params) {
    // surface 타입인 경우 (원뿔 클릭)
    if (params.componentSubType === 'surface') {
        const series = option.series[params.seriesIndex];
        
        if (series.coneInfo) {
            const conePos = series.coneInfo.position;
            const coneRadius = series.coneInfo.radius;
            const coneIndex = series.coneInfo.index;
            
            console.log(`원뿔 #${coneIndex} 클릭됨 (위치: x=${conePos.x.toFixed(2)}, y=${conePos.y.toFixed(2)})`);
            
            // 원뿔 밑면 영역 내의 모든 3D 바 찾기
            const barsInConeArea = [];
            const radiusSquared = coneRadius * coneRadius;
            const { coordinates } = generateCircularCoordinates(CONFIG.bar.maxCount, CONFIG.grid.radius);
            
            for (const coord of coordinates) {
                // 이 점이 원뿔의 밑면 영역 안에 있는지 확인
                const distX = coord.x - conePos.x;
                const distY = coord.y - conePos.y;
                const distanceSquared = distX * distX + distY * distY;
                
                if (distanceSquared <= radiusSquared) {
                    barsInConeArea.push({
                        x: coord.x.toFixed(2),
                        y: coord.y.toFixed(2),
                        distance: Math.sqrt(distanceSquared).toFixed(2),
                        inCone: `원뿔 #${coneIndex}`
                    });
                }
            }
            
            // 콘솔에 출력
            console.log(`원뿔 #${coneIndex} 밑면 영역 안의 바 (총 ${barsInConeArea.length}개):`);
            console.table(barsInConeArea);
            
            // 클릭한 원뿔 강조 표시
            highlightCone(coneIndex);
        }
    }
    // bar3D 타입인 경우 (3D 바 클릭)
    else if (params.componentSubType === 'bar3D' && params.seriesName === '3D Bars') {
        const barPos = {
            x: params.data.value[0],
            y: params.data.value[1]
        };
        console.log(`3D 바 클릭됨 (위치: x=${barPos.x.toFixed(2)}, y=${barPos.y.toFixed(2)})`);
        
        // 이 바 주변의 원뿔 찾기
        findConesAroundBar(barPos);
    }
});

/**
 * 3D 바 주변 원뿔 찾기
 * @param {Object} barPos - 바 위치 {x, y}
 */
function findConesAroundBar(barPos) {
    const { coordinates: coneCoordinates } = generateCircularCoordinates(
        CONFIG.cone.maxCount, 
        CONFIG.grid.radius
    );
    
    const nearCones = [];
    
    for (let i = 0; i < coneCoordinates.length; i++) {
        const conePos = coneCoordinates[i];
        const distX = conePos.x - barPos.x;
        const distY = conePos.y - barPos.y;
        const distance = Math.sqrt(distX * distX + distY * distY);
        
        // 원뿔 반경 내에 있는지 확인
        if (distance <= CONFIG.cone.radius) {
            nearCones.push({
                coneIndex: i,
                coneX: conePos.x.toFixed(2),
                coneY: conePos.y.toFixed(2),
                distance: distance.toFixed(2)
            });
        }
    }
    
    // 콘솔에 출력
    console.log(`3D 바 (x=${barPos.x.toFixed(2)}, y=${barPos.y.toFixed(2)}) 주변의 원뿔 (총 ${nearCones.length}개):`);
    console.table(nearCones);
    
    // 해당하는 원뿔들 강조 표시
    if (nearCones.length > 0) {
        highlightCones(nearCones.map(cone => cone.coneIndex));
    }
}

/**
 * 여러 원뿔 강조 표시 함수
 * @param {Array} coneIndices - 강조할 원뿔 인덱스 배열
 */
function highlightCones(coneIndices) {
    const currentOption = myChart.getOption();
    
    const newSeries = currentOption.series.map(series => {
        if (series.coneInfo) {
            const isTarget = coneIndices.includes(series.coneInfo.index);
            
            return {
                ...series,
                itemStyle: {
                    ...series.itemStyle,
                    color: isTarget ? '#ff5500' : CONFIG.cone.color,
                    opacity: isTarget ? 1.0 : CONFIG.cone.opacity * 0.7
                }
            };
        }
        return series;
    });
    
    myChart.setOption({
        series: newSeries
    });
    
    // 3초 후 원래 상태로 복원
    setTimeout(() => {
        const resetSeries = currentOption.series.map(series => {
            if (series.coneInfo) {
                return {
                    ...series,
                    itemStyle: {
                        ...series.itemStyle,
                        color: CONFIG.cone.color,
                        opacity: CONFIG.cone.opacity
                    }
                };
            }
            return series;
        });
        
        myChart.setOption({
            series: resetSeries
        });
    }, 3000);
}

/**
 * 원뿔 강조 표시 함수
 * @param {number} coneIndex - 강조할 원뿔 인덱스
 */
function highlightCone(coneIndex) {
    // 현재 옵션 가져오기
    const currentOption = myChart.getOption();
    
    // 각 시리즈 순회하며 강조/비강조 처리
    const newSeries = currentOption.series.map(series => {
        if (series.coneInfo) {
            const isTarget = series.coneInfo.index === coneIndex;
            
            // 원뿔 강조/비강조 스타일 설정
            return {
                ...series,
                itemStyle: {
                    ...series.itemStyle,
                    color: isTarget ? '#ff5500' : CONFIG.cone.color,
                    opacity: isTarget ? 1.0 : CONFIG.cone.opacity * 0.7
                }
            };
        }
        return series;
    });
    
    // 새 옵션 적용
    myChart.setOption({
        series: newSeries
    });
    
    // 3초 후 원래 상태로 복원
    setTimeout(() => {
        const resetSeries = currentOption.series.map(series => {
            if (series.coneInfo) {
                return {
                    ...series,
                    itemStyle: {
                        ...series.itemStyle,
                        color: CONFIG.cone.color,
                        opacity: CONFIG.cone.opacity
                    }
                };
            }
            return series;
        });
        
        myChart.setOption({
            series: resetSeries
        });
    }, 3000);
}

// ----- UI 컨트롤 -----

/**
 * 모양 전환 버튼 생성
 * @returns {HTMLElement} 생성된 버튼 요소
 */
function createToggleButton() {
    const button = document.createElement('button');
    button.innerText = '모양 변경 (현재: 모두 표시)';
    button.style.position = 'absolute';
    button.style.top = '60px';
    button.style.left = '50%';
    button.style.transform = 'translateX(-50%)';
    button.style.padding = '8px 16px';
    button.style.fontSize = '14px';
    button.style.fontWeight = 'bold';
    button.style.backgroundColor = '#4285f4';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.zIndex = '100';
    
    // 버튼 클릭 이벤트 추가
    button.onclick = toggleShapeMode;
    
    return button;
}

/**
 * 모양 모드 전환 함수
 */
function toggleShapeMode() {
    // CONFIG 설정 토글
    if (CONFIG.bar.maxCount > 0 && CONFIG.cone.maxCount > 0) {
        // 원뿔만 표시
        CONFIG.bar.maxCount = 0;
        toggleButton.innerText = '모양 변경 (현재: 원뿔만)';
    } else if (CONFIG.cone.maxCount > 0) {
        // 바만 표시
        CONFIG.cone.maxCount = 0;
        CONFIG.bar.maxCount = DEFAULT_BAR_COUNT;
        toggleButton.innerText = '모양 변경 (현재: 3D 바만)';
    } else {
        // 둘 다 표시
        CONFIG.cone.maxCount = DEFAULT_CONE_COUNT;
        CONFIG.bar.maxCount = DEFAULT_BAR_COUNT;
        toggleButton.innerText = '모양 변경 (현재: 모두 표시)';
    }
    
    // 새 옵션 적용
    const newOption = { 
        ...createBaseOption(), 
        series: createCombinedSeries() 
    };
    myChart.setOption(newOption, true);
}

/**
 * 시점 버튼 생성 함수
 * @param {string} text - 버튼 텍스트
 * @returns {HTMLElement} 생성된 버튼
 */
function createViewButton(text) {
    const button = document.createElement('button');
    button.innerText = text;
    button.style.padding = '8px 12px';
    button.style.backgroundColor = '#4285f4';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.onmouseenter = () => { button.style.backgroundColor = '#3b78e7'; };
    button.onmouseleave = () => { button.style.backgroundColor = '#4285f4'; };
    return button;
}

// 뷰 컨트롤 버튼 컨테이너 생성
const viewControlDiv = document.createElement('div');
viewControlDiv.style.position = 'absolute';
viewControlDiv.style.top = '20px';
viewControlDiv.style.right = '20px';
viewControlDiv.style.display = 'flex';
viewControlDiv.style.flexDirection = 'column';
viewControlDiv.style.gap = '10px';

// 탑뷰 버튼
const topViewButton = createViewButton('Top View');
topViewButton.onclick = () => {
    myChart.setOption({
        grid3D: {
            viewControl: {
                alpha: 90,
                beta: 0,
                distance: CONFIG.grid.radius * 3,
                animation: true,
                animationDurationUpdate: 500,
                autoRotate: false
            }
        }
    });
};

// 측면뷰 버튼
const sideViewButton = createViewButton('Side View');
sideViewButton.onclick = () => {
    myChart.setOption({
        grid3D: {
            viewControl: {
                alpha: 0,
                beta: 0,
                distance: CONFIG.grid.radius * 3,
                animation: true,
                animationDurationUpdate: 500,
                autoRotate: false
            }
        }
    });
};

// 비스듬한 각도에서 보는 뷰 버튼
const perspectiveViewButton = createViewButton('Perspective View');
perspectiveViewButton.onclick = () => {
    myChart.setOption({
        grid3D: {
            viewControl: {
                alpha: 40,
                beta: 30,
                distance: CONFIG.grid.radius * 3.5,
                animation: true,
                animationDurationUpdate: 500,
                autoRotate: false
            }
        }
    });
};


// 버튼 추가
viewControlDiv.appendChild(topViewButton);
viewControlDiv.appendChild(sideViewButton);
viewControlDiv.appendChild(perspectiveViewButton);

// 모양 토글 버튼 추가
const toggleButton = createToggleButton();

// 차트 컨테이너에 버튼 추가
chartDom.style.position = 'relative';
chartDom.appendChild(viewControlDiv);
chartDom.appendChild(toggleButton);

// 설정 정보 표시 함수
function showConfigInfo() {
    const infoDiv = document.createElement('div');
    infoDiv.style.position = 'absolute';
    infoDiv.style.bottom = '20px';
    infoDiv.style.left = '20px';
    infoDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    infoDiv.style.color = 'white';
    infoDiv.style.padding = '10px';
    infoDiv.style.borderRadius = '5px';
    infoDiv.style.fontSize = '12px';
    infoDiv.style.maxWidth = '250px';
    
    infoDiv.innerHTML = `
        <strong>3D 바:</strong> ${CONFIG.bar.maxCount}개<br>
        <strong>원뿔:</strong> ${CONFIG.cone.maxCount}개<br>
        <strong>3D 바 높이:</strong> ${CONFIG.bar.height}<br>
        <strong>원뿔 높이:</strong> ${CONFIG.cone.height}<br>
        <strong>3D 바 크기:</strong> ${CONFIG.bar.size}<br>
        <strong>원뿔 반지름:</strong> ${CONFIG.cone.radius}<br>
        <strong>그리드 반지름:</strong> ${CONFIG.grid.radius}
    `;
    
    chartDom.appendChild(infoDiv);
    
    // 10초 후 자동 제거
    setTimeout(() => {
        chartDom.removeChild(infoDiv);
    }, 10000);
}

// 설정 정보 버튼
const infoButton = createViewButton('설정 정보');
infoButton.style.position = 'absolute';
infoButton.style.bottom = '20px';
infoButton.style.right = '20px';
infoButton.onclick = showConfigInfo;
chartDom.appendChild(infoButton);

// 차트 크기 변경 시 업데이트
window.addEventListener('resize', () => {
    myChart.resize();
});