/**
 * Geometry collecting bars data
 *
 * @module echarts-gl/chart/bars/BarsGeometry
 * @author Yi Shen(http://github.com/pissang)
 */

import * as echarts from 'echarts/lib/echarts';
import dynamicConvertMixin from './dynamicConvertMixin';
import trianglesSortMixin from './trianglesSortMixin';
import Geometry from 'claygl/src/Geometry';

import glMatrix from 'claygl/src/dep/glmatrix';
var vec3 = glMatrix.vec3;
var mat3 = glMatrix.mat3;

/**
 * @constructor
 * @alias module:echarts-gl/chart/bars/BarsGeometry
 * @extends clay.Geometry
 */

const BAR_VERTEX_COUNT = 5
const BAR_TRIANGLE_COUNT = 6
var BarsGeometry = Geometry.extend(function () {
    return {

        attributes: {
            position: new Geometry.Attribute('position', 'float', 3, 'POSITION'),
            normal: new Geometry.Attribute('normal', 'float', 3, 'NORMAL'),
            color: new Geometry.Attribute('color', 'float', 4, 'COLOR'),

            prevPosition: new Geometry.Attribute('prevPosition', 'float', 3),
            prevNormal: new Geometry.Attribute('prevNormal', 'float', 3)
        },

        dynamic: true,

        enableNormal: false,

        bevelSize: 1,
        bevelSegments: 0,

        // Map from vertexIndex to dataIndex.
        _dataIndices: null,

        _vertexOffset: 0,
        _triangleOffset: 0
    };
},
/** @lends module:echarts-gl/chart/bars/BarsGeometry.prototype */
{

    resetOffset: function () {
        this._vertexOffset = 0;
        this._triangleOffset = 0;
    },

    /**
     * 
     * bar를 N개 그릴 건데, 그만큼의 메모리(버퍼)를 미리 확보해놓는 함수
     *   "나 이만큼의 바 그릴 거야"
     *   "그럼 그만큼의 정점/삼각형 공간 미리 만들어놔"
     *   "나중에 하나씩 정점 넣을 거야. 그때 set() 쓰려면 이게 먼저 필요해"
     */


    setBarCount: function (barCount) {
        var enableNormal = this.enableNormal;
        // 	bar 하나당 필요한 정점 개수. 보통 bar는 8개의 정점을 가진다.
        var vertexCount = BAR_VERTEX_COUNT * barCount; 
        // 	bar 하나당 필요한 삼각형 개수. 보통 bar는 12개
        var triangleCount = BAR_TRIANGLE_COUNT * barCount;
        const VERTEX_COUNT_FOR_TRIANGLE = 3

        // GPU에 넘길 VBO(Vertex Buffer Object)를 위한 실제 공간을 Float32Array 등으로 초기화
        if (this.vertexCount !== vertexCount) {
            this.attributes.position.init(vertexCount);
            if (enableNormal) {
                this.attributes.normal.init(vertexCount);
            }
            else {
                this.attributes.normal.value = null;
            }
            this.attributes.color.init(vertexCount);
        }

        if (this.triangleCount !== triangleCount) {
            /**
             * "정점 개수가 65,535개를 넘느냐?" 를 체크. GPU용 렌더링 정보임.
                넘으면 → Uint32Array (32비트 정수 배열)
                안 넘으면 → Uint16Array (16비트 정수 배열)
                16비트는 메모리를 절반만쓰고 GPU가 더 빠르게 읽고, 더 작고 빠른 캐시로 처리 가능. 대부분 차트들은 65536개 이하의 정점이면 충분하기때문에 무조건 32비트를 쓰지않고 조건에 따라 사용.
             */
            this.indices = vertexCount > 0xffff ? new Uint32Array(triangleCount * 3) : new Uint16Array(triangleCount * 3);

            /**
             * dataIndices는 각 젇점이 어떤 데이터에 속하는지 추적하는 데이터임. 
             * Echart 로직 내부 즉 CPU측에서 동작한다. 얘는 GPU로 보내지 않고 내부 관리용 데이터이기 떄문에 그냥 32bit사용.
             */
            this._dataIndices = new Uint32Array(vertexCount);
        }
    },

    _getBevelBarVertexCount: function (bevelSegments) {
        return (bevelSegments + 1) * 4 * (bevelSegments + 1) * 2;
    },

    _getBevelBarTriangleCount: function (bevelSegments) {
        var widthSegments = bevelSegments * 4 + 3;
        var heightSegments = bevelSegments * 2 + 1;
        return (widthSegments + 1) * heightSegments * 2 + 4;
    },

    setColor: function (idx, color) {
        var start = BAR_VERTEX_COUNT * idx;
        var end = BAR_VERTEX_COUNT * (idx + 1);
        for (var i = start; i < end; i++) {
            this.attributes.color.set(i, color);
        }
        this.dirtyAttribute('color');
    },

    /**
     * Get dataIndex of vertex.
     * @param {number} vertexIndex
     */
    getDataIndexOfVertex: function (vertexIndex) {
        return this._dataIndices ? this._dataIndices[vertexIndex] : null;
    },

    /**
     * Add a bar
     * @param {Array.<number>} start
     * @param {Array.<number>} end
     * @param {Array.<number>} orient  right direction
     * @param {Array.<number>} size size on x and z
     * @param {Array.<number>} color
     */
    addBar: (function () {
        var v3Create = vec3.create;
        var v3ScaleAndAdd = vec3.scaleAndAdd;

        var end = v3Create();
        var px = v3Create();
        var py = v3Create();
        var pz = v3Create();
        var nx = v3Create();
        var ny = v3Create();
        var nz = v3Create();

        var pts = [];
        for (var i = 0; i < BAR_VERTEX_COUNT; i++) {
            pts[i] = v3Create();
        }

        var cubeFaces3 = [
            [0, 1, 4], // 바닥점 0,1 + 꼭대기 4
            [1, 2, 4], // 1,2 + 꼭대기
            [2, 3, 4], // ...
            [3, 0, 4],
            // (선택) 바닥도 면 만들고 싶으면 아래 2개 추가
            [0, 2, 1],
            [0, 3, 2]
          ];
        return function (start, dir, leftDir, size, color, dataIndex) {

            // Use vertex, triangle maybe sorted.
            var startVertex = this._vertexOffset;

            if (this.bevelSize > 0 && this.bevelSegments > 0) {
                this._addBevelBar(start, dir, leftDir, size, this.bevelSize, this.bevelSegments, color);
            }
            else {
                vec3.copy(py, dir);
                vec3.normalize(py, py);
                // x * y => z
                vec3.cross(pz, leftDir, py);
                vec3.normalize(pz, pz);
                // y * z => x
                vec3.cross(px, py, pz);
                vec3.normalize(pz, pz);

                vec3.negate(nx, px);
                vec3.negate(ny, py);
                vec3.negate(nz, pz);

                // 바닥 4개 점
                v3ScaleAndAdd(pts[0], start, px, size[0] / 2);
                v3ScaleAndAdd(pts[0], pts[0], pz, size[2] / 2);
                v3ScaleAndAdd(pts[1], start, px, size[0] / 2);
                v3ScaleAndAdd(pts[1], pts[1], nz, size[2] / 2);
                v3ScaleAndAdd(pts[2], start, nx, size[0] / 2);
                v3ScaleAndAdd(pts[2], pts[2], nz, size[2] / 2);
                v3ScaleAndAdd(pts[3], start, nx, size[0] / 2);
                v3ScaleAndAdd(pts[3], pts[3], pz, size[2] / 2);

                // 위쪽 좌표 만들기 전에 py방향으로 size[1]만큼 이동한 뒤 계싼
                v3ScaleAndAdd(end, start, py, size[1]);

                // 일단 사각뿔로 한다고 하면 상단 정점 1개만 정의하면됨.
                v3ScaleAndAdd(pts[4], start, py, size[1]);

                var attributes = this.attributes;
                for (var i = 0; i < cubeFaces3.length; i++) {
                    var idx3 = this._triangleOffset * 3;
                    for (var k = 0; k < 3; k++) {
                        this.indices[idx3 + k] = cubeFaces3[i][k] + this._vertexOffset;
                    }
                    this._triangleOffset++;
                }

                for (var i = 0; i < pts.length; i++) {
                    attributes.position.set(this._vertexOffset, pts[i]);
                    attributes.color.set(this._vertexOffset++, color);
                }
            }

            var endVerex = this._vertexOffset;

            for (var i = startVertex; i < endVerex; i++) {
                this._dataIndices[i] = dataIndex;
            }
        };
    })(),

    /**
     * Add a bar with bevel
     * @param {Array.<number>} start
     * @param {Array.<number>} end
     * @param {Array.<number>} orient  right direction
     * @param {Array.<number>} size size on x and z
     * @param {number} bevelSize
     * @param {number} bevelSegments
     * @param {Array.<number>} color
     */
    _addBevelBar: (function () {
        var px = vec3.create();
        var py = vec3.create();
        var pz = vec3.create();

        var rotateMat = mat3.create();

        var bevelStartSize = [];

        var xOffsets = [1, -1, -1, 1];
        var zOffsets = [1, 1, -1, -1];
        var yOffsets = [2, 0];

        return function (start, dir, leftDir, size, bevelSize, bevelSegments, color) {
            vec3.copy(py, dir);
            vec3.normalize(py, py);
            // x * y => z
            vec3.cross(pz, leftDir, py);
            vec3.normalize(pz, pz);
            // y * z => x
            vec3.cross(px, py, pz);
            vec3.normalize(pz, pz);

            rotateMat[0] = px[0]; rotateMat[1] = px[1]; rotateMat[2] = px[2];
            rotateMat[3] = py[0]; rotateMat[4] = py[1]; rotateMat[5] = py[2];
            rotateMat[6] = pz[0]; rotateMat[7] = pz[1]; rotateMat[8] = pz[2];

            bevelSize = Math.min(size[0], size[2]) / 2 * bevelSize;

            for (var i = 0; i < 3; i++) {
                bevelStartSize[i] = Math.max(size[i] - bevelSize * 2, 0);
            }
            var rx = (size[0] - bevelStartSize[0]) / 2;
            var ry = (size[1] - bevelStartSize[1]) / 2;
            var rz = (size[2] - bevelStartSize[2]) / 2;

            var pos = [];
            var normal = [];
            var vertexOffset = this._vertexOffset;

            var endIndices = [];
            for (var i = 0; i < 2; i++) {
                endIndices[i] = endIndices[i] = [];

                for (var m = 0; m <= bevelSegments; m++) {
                    for (var j = 0; j < 4; j++) {
                        if ((m === 0 && i === 0) || (i === 1 && m === bevelSegments)) {
                            endIndices[i].push(vertexOffset);
                        }
                        for (var n = 0; n <= bevelSegments; n++) {

                            var phi = n / bevelSegments * Math.PI / 2 + Math.PI / 2 * j;
                            var theta = m / bevelSegments * Math.PI / 2 + Math.PI / 2 * i;
                            // var r = rx < ry ? (rz < rx ? rz : rx) : (rz < ry ? rz : ry);
                            normal[0] = rx * Math.cos(phi) * Math.sin(theta);
                            normal[1] = ry * Math.cos(theta);
                            normal[2] = rz * Math.sin(phi) * Math.sin(theta);
                            pos[0] = normal[0] + xOffsets[j] * bevelStartSize[0] / 2;
                            pos[1] = (normal[1] + ry) + yOffsets[i] * bevelStartSize[1] / 2;
                            pos[2] = normal[2] + zOffsets[j] * bevelStartSize[2] / 2;

                            // Normal is not right if rx, ry, rz not equal.
                            if (!(Math.abs(rx - ry) < 1e-6 && Math.abs(ry - rz) < 1e-6)) {
                                normal[0] /= rx * rx;
                                normal[1] /= ry * ry;
                                normal[2] /= rz * rz;
                            }
                            vec3.normalize(normal, normal);

                            vec3.transformMat3(pos, pos, rotateMat);
                            vec3.transformMat3(normal, normal, rotateMat);
                            vec3.add(pos, pos, start);

                            this.attributes.position.set(vertexOffset, pos);
                            if (this.enableNormal) {
                                this.attributes.normal.set(vertexOffset, normal);
                            }
                            this.attributes.color.set(vertexOffset, color);
                            vertexOffset++;
                        }
                    }
                }
            }

            var widthSegments = bevelSegments * 4 + 3;
            var heightSegments = bevelSegments * 2 + 1;

            var len = widthSegments + 1;

            for (var j = 0; j < heightSegments; j ++) {
                for (var i = 0; i <= widthSegments; i ++) {
                    var i2 = j * len + i + this._vertexOffset;
                    var i1 = (j * len + (i + 1) % len) + this._vertexOffset;
                    var i4 = (j + 1) * len + (i + 1) % len + this._vertexOffset;
                    var i3 = (j + 1) * len + i + this._vertexOffset;

                    this.setTriangleIndices(this._triangleOffset++, [i4, i2, i1]);
                    this.setTriangleIndices(this._triangleOffset++, [i4, i3, i2]);
                }
            }

            // Close top and bottom
            this.setTriangleIndices(this._triangleOffset++, [endIndices[0][0], endIndices[0][2], endIndices[0][1]]);
            this.setTriangleIndices(this._triangleOffset++, [endIndices[0][0], endIndices[0][3], endIndices[0][2]]);
            this.setTriangleIndices(this._triangleOffset++, [endIndices[1][0], endIndices[1][1], endIndices[1][2]]);
            this.setTriangleIndices(this._triangleOffset++, [endIndices[1][0], endIndices[1][2], endIndices[1][3]]);

            this._vertexOffset = vertexOffset;
        };
    })()
});

echarts.util.defaults(BarsGeometry.prototype, dynamicConvertMixin);
echarts.util.defaults(BarsGeometry.prototype, trianglesSortMixin);

export default BarsGeometry;