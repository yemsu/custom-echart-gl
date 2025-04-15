// TODO ECharts GL must be imported whatever component,charts is imported.
import '../../echarts-gl';


import registerBarLayout from './Wafermap3DLayout';
import Bar3DSeries from './Wafermap3DSeries';
import Bar3DView from './Wafermap3DView';

export function install(registers) {
    registers.registerChartView(Bar3DView);
    registers.registerSeriesModel(Bar3DSeries);

    registerBarLayout(registers);

    registers.registerProcessor(function (ecModel, api) {
        ecModel.eachSeriesByType('bar3d', function (seriesModel) {
            var data = seriesModel.getData();
            data.filterSelf(function (idx) {
                return data.hasValue(idx);
            });
        });
    });
}