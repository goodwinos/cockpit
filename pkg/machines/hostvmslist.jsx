/*jshint esversion: 6 */
/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2016 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */
import cockpit from 'cockpit';
import React, { PropTypes } from "react";
import { shutdownVm, forceVmOff, forceRebootVm, rebootVm, startVm } from "./actions.es6";
import { rephraseUI, logDebug, toGigaBytes, toFixedPrecision } from "./helpers.es6";
import DonutChart from "./c3charts.jsx";
import { Listing, ListingRow } from "cockpit-components-listing.jsx";
import VmDisksTab from './vmdiskstab.jsx';

const _ = cockpit.gettext;

const NoVm = () => {
    return (<div className="cockpit-log-warning">
        <div className="blank-slate-pf">
            <div className="blank-slate-pf-icon">
                <i className="pficon pficon-virtual-machine"></i>
                <h1>{ _("No VM is running or defined on this host") }</h1>
            </div>
        </div>
    </div>);
}

const VmActions = ({ vm, config, dispatch, onStart, onReboot, onForceReboot, onShutdown, onForceoff }) => {
    const id = vmId(vm.name);
    const state = vm.state;

    let reset = null;
    if (config.provider.canReset(state)) {
        reset = DropdownButtons({
            buttons: [{
                title: _("Restart"),
                action: onReboot,
                id: `${id}-reboot`
            }, {
                title: _("Force Restart"),
                action: onForceReboot,
                id: `${id}-forceReboot`
            }]
        });
    }

    let shutdown = null;
    if (config.provider.canShutdown(state)) {
        shutdown = DropdownButtons({
            buttons: [{
                title: _("Shut Down"),
                action: onShutdown,
                id: `${id}-off`
            }, {
                title: _("Force Shut Down"),
                action: onForceoff,
                id: `${id}-forceOff`
            }]
        });
    }

    let run = null;
    if (config.provider.canRun(state)) {
        run = (<button className="btn btn-default btn-danger" onClick={onStart} id={`${id}-run`}>
            {_("Run")}
        </button>);
    }

    let providerActions = null;
    if (config.provider.vmActionsFactory) {
        const ProviderActions = config.provider.vmActionsFactory();
        providerActions = <ProviderActions vm={vm} providerState={config.providerState} dispatch={dispatch} />;
    }

    return (<div>
        {reset}
        {shutdown}
        {run}
        {providerActions}
    </div>);
}
VmActions.propTypes = {
    vm: PropTypes.object.isRequired,
    config: PropTypes.string.isRequired,
    dispatch: PropTypes.func.isRequired,
    onStart: PropTypes.func.isRequired,
    onReboot: PropTypes.func.isRequired,
    onForceReboot: PropTypes.func.isRequired,
    onShutdown: PropTypes.func.isRequired,
    onForceoff: PropTypes.func.isRequired
}

const IconElement = ({ onClick, className, title, state }) => {
    return (<span title={title} data-toggle='tooltip' data-placement='left'>
        {state}&nbsp;<i onClick={onClick} className={className}/>
    </span>);
}
IconElement.propTypes = {
    onClick: PropTypes.func,
    className: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    state: PropTypes.string.isRequired,
}

export const StateIcon = ({ state, config, valueId }) => {
    if (state === undefined) {
        return (<div/>);
    }

    let stateMap = {
        running: {className: 'pficon pficon-ok icon-1x-vms', title: _("The VM is running.")}, // TODO: display VM screenshot if available or the ok-icon otherwise
        idle: {className: 'pficon pficon-running icon-1x-vms', title: _("The VM is idle.")},
        paused: {className: 'pficon pficon-pause icon-1x-vms', title: _("The VM is paused.")},
        shutdown: {className: 'glyphicon glyphicon-wrench icon-1x-vms', title: _("The VM is going down.")},
        'shut off': {className: 'fa fa-arrow-circle-o-down icon-1x-vms', title: _("The VM is down.")},
        crashed: {className: 'pficon pficon-error-circle-o icon-1x-vms', title: _("The VM crashed.")},
        dying: {className: 'pficon pficon-warning-triangle-o icon-1x-vms',
            title: _("The VM is in process of dying (shut down or crash is not completed).")},
        pmsuspended: {className: 'pficon pficon-ok icon-1x-vms', title: _("The VM is suspended by guest power management.")},
    };
    if (config.provider.vmStateMap) { // merge default and provider's stateMap to allow both reuse and extension
        stateMap = Object.assign(stateMap, config.provider.vmStateMap);
    }

    if (stateMap[state]) {
        return (
            <span title={stateMap[state].title} data-toggle='tooltip' data-placement='left'>
                <span id={valueId}>{rephraseUI('vmStates', state)}</span>
                &nbsp;
                <i className={stateMap[state].className} />
            </span>);
    }
    return (<small>{state}</small>);
}
StateIcon.propTypes = {
    state: PropTypes.string.isRequired,
    config: PropTypes.string.isRequired
}

/**
 * Render group of buttons as a dropdown
 *
 * @param buttons array of objects [ {title, action, id}, ... ].
 *        At least one button is required. Button id is optional.
 * @returns {*}
 * @constructor
 */
export const DropdownButtons = ({ buttons }) => {
    const buttonsHtml = buttons
        .filter(button => buttons[0].id === undefined || buttons[0].id !== button.id)
        .map(button => {
            return (<li className='presentation'>
                <a role='menuitem' onClick={button.action} id={button.id}>
                    {button.title}
                </a>
            </li>)
        });

    const caretId = buttons[0]['id'] ? `${buttons[0]['id']}-caret` : undefined;
    return (<div className='btn-group'>
        <button className='btn btn-default btn-danger' onClick={buttons[0].action} id={buttons[0]['id']}>
            {buttons[0].title}
        </button>
        <button data-toggle='dropdown' className='btn btn-default dropdown-toggle'>
            <span className='caret' id={caretId}/>
        </button>
        <ul role='menu' className='dropdown-menu'>
            {buttonsHtml}
        </ul>
    </div>);
}
DropdownButtons.propTypes = {
    buttons: PropTypes.array.isRequired
}

function vmId(vmName) {
    return `vm-${vmName}`;
}

const VmOverviewTabRecord = ({id, descr, value}) => {
    return (<tr>
        <td className='top'>
            <label className='control-label'>
                {descr}
            </label>
        </td>
        <td id={id}>
            {value}
        </td>
    </tr>);
};
VmOverviewTabRecord.propTypes = {
    id: PropTypes.string,
    descr: PropTypes.string.isRequired,
    value: PropTypes.string.isRequired
}

const VmLastMessage = ({ vm }) => {
    if (!vm.lastMessage) {
        return (<tr />); // reserve space to keep rendered structure
    }

    const msgId = `${vmId(vm.name)}-last-message`;
    const detail = (vm.lastMessageDetail && vm.lastMessageDetail.exception) ? vm.lastMessageDetail.exception: vm.lastMessage;

    return (
        <div>
            <span className='pficon-warning-triangle-o' />&nbsp;
            <span title={detail} data-toggle='tooltip' id={msgId}>
                {vm.lastMessage}
            </span>
        </div>
    );
};
VmLastMessage.propTypes = {
    vm: PropTypes.object.isRequired
}

const VmBootOrder = ({ vm }) => {
    let bootOrder = _("No boot device found");

    if (vm.bootOrder && vm.bootOrder.devices && vm.bootOrder.devices.length > 0) {
        bootOrder = vm.bootOrder.devices.map(bootDevice => bootDevice.type).join(); // Example: network,disk,disk
    }

    return (<VmOverviewTabRecord id={`${vmId(vm.name)}-bootorder`} descr={_("Boot Order:")} value={bootOrder}/>);
};
VmBootOrder.propTypes = {
    vm: PropTypes.object.isRequired
};

const VmOverviewTab = ({ vm, config }) => {
    let providerContent = null;
    if (config.provider.vmOverviewPropsFactory) {
        const ProviderContent = config.provider.vmOverviewPropsFactory();
        providerContent = (<ProviderContent vm={vm} providerState={config.providerState}/>);
    }

    return (<div>
        <table className='machines-width-max'>
            <tr className='machines-listing-ct-body-detail'>
                <td className='machines-listing-detail-top-column'>
                    <table className='form-table-ct'>
                        <VmOverviewTabRecord descr={_("Memory:")}
                                             value={cockpit.format_bytes((vm.currentMemory ? vm.currentMemory : 0) * 1024)}/>
                        <VmOverviewTabRecord id={`${vmId(vm.name)}-vcpus`} descr={_("vCPUs:")} value={vm.vcpus}/>
                    </table>
                </td>

                <td className='machines-listing-detail-top-column'>
                    <table className='form-table-ct'>
                        <VmOverviewTabRecord id={`${vmId(vm.name)}-emulatedmachine`}
                                             descr={_("Emulated Machine:")} value={vm.emulatedMachine}/>
                        <VmOverviewTabRecord id={`${vmId(vm.name)}-cputype`}
                                             descr={_("CPU Type:")} value={vm.cpuModel}/>
                    </table>
                </td>

                <td className='machines-listing-detail-top-column'>
                    <table className='form-table-ct'>
                        <VmBootOrder vm={vm} />
                        <VmOverviewTabRecord id={`${vmId(vm.name)}-autostart`}
                                             descr={_("Autostart:")} value={rephraseUI('autostart', vm.autostart)}/>
                    </table>
                </td>

                {providerContent}
            </tr>
        </table>
        <VmLastMessage vm={vm} />
    </div>);
};
VmOverviewTab.propTypes = {
    vm: PropTypes.object.isRequired,
    config: PropTypes.object.isRequired,
}

const VmUsageTab = ({ vm }) => {
    const width = 220;
    const height = 170;

    const rssMem = vm["rssMemory"] ? vm["rssMemory"] : 0; // in KiB
    const memTotal = vm["currentMemory"] ? vm["currentMemory"] : 0; // in KiB
    let available = memTotal - rssMem; // in KiB
    available = available < 0 ? 0 : available;

    const totalCpus = vm['vcpus'] > 0 ? vm['vcpus'] : 0;
    // 4 CPU system can have usage 400%, let's keep % between 0..100
    let cpuUsage = vm['cpuUsage'] / (totalCpus > 0 ? totalCpus : 1);
    cpuUsage = isNaN(cpuUsage) ? 0 : cpuUsage;
    cpuUsage = toFixedPrecision(cpuUsage, 1);

    logDebug(`VmUsageTab.render(): rssMem: ${rssMem} KiB, memTotal: ${memTotal} KiB, available: ${available} KiB, totalCpus: ${totalCpus}, cpuUsage: ${cpuUsage}`);

    const memChartData = {
        columns: [
            [_("Used"), toGigaBytes(rssMem, 'KiB')],
            [_("Available"), toGigaBytes(available, 'KiB')]
        ],
        groups: [
            ["used", "available"]
        ],
        order: null
    };

    const cpuChartData = {
        columns: [
            [_("Used"), cpuUsage],
            [_("Available"), 100.0 - cpuUsage]
        ],
        groups: [
            ["used", "available"]
        ],
        order: null
    };

    const chartSize = {
        width, // keep the .usage-donut-caption CSS in sync
        height
    }

    return (<table>
            <tr>
                <td>
                    <DonutChart data={memChartData} size={chartSize} width='8' tooltipText=' '
                                primaryTitle={toGigaBytes(rssMem, 'KiB')} secondaryTitle='GB'
                                caption={`used from ${cockpit.format_bytes(memTotal * 1024)} memory`}/>
                </td>

                <td>
                    <DonutChart data={cpuChartData} size={chartSize} width='8' tooltipText=' '
                                primaryTitle={cpuUsage} secondaryTitle='%'
                                caption={`used from ${totalCpus} vCPUs`}/>
                </td>
            </tr>
        </table>

    );
};
VmUsageTab.propTypes = {
    vm: React.PropTypes.object.isRequired
};

/** One VM in the list (a row)
 */
const Vm = ({ vm, config, onStart, onShutdown, onForceoff, onReboot, onForceReboot, dispatch }) => {
    const stateIcon = (<StateIcon state={vm.state} config={config} valueId={`${vmId(vm.name)}-state`} />);

    let tabRenderers = [
        {name: _("Overview"), renderer: VmOverviewTab, data: {vm: vm, config: config }},
        {name: _("Usage"), renderer: VmUsageTab, data: {vm: vm}, presence: 'onlyActive' },
        {name: (<div id={`${vmId(vm.name)}-disks`}>{_("Disks")}</div>), renderer: VmDisksTab, data: {vm: vm, provider: config.provider}, presence: 'onlyActive' }
    ];
    if (config.provider.vmTabRenderers) { // External Provider might extend the subtab list
        tabRenderers = tabRenderers.concat(config.provider.vmTabRenderers.map(
            tabRender => {
                return {
                    name: tabRender.name,
                    renderer: tabRender.componentFactory(),
                    data: { vm, providerState: config.providerState, dispatch }};
            }
        ));
    }

    const name = (<span id={`${vmId(vm.name)}-row`}>{vm.name}</span>);
    const rowName = (vm.lastMessage) ?
        (<div><span className='pficon-warning-triangle-o' />&nbsp;{name}</div>)
        : name;

    return (<ListingRow
        columns={[
            {name: rowName, 'header': true},
            rephraseUI('connections', vm.connectionName),
            stateIcon
            ]}
        tabRenderers={tabRenderers}
        listingActions={VmActions({vm, config, dispatch,
            onStart, onReboot, onForceReboot, onShutdown, onForceoff})}/>);
};
Vm.propTypes = {
    vm: React.PropTypes.object.isRequired,
    config: React.PropTypes.object.isRequired,
    onStart: React.PropTypes.func.isRequired,
    onShutdown: React.PropTypes.func.isRequired,
    onForceoff: React.PropTypes.func.isRequired,
    onReboot: React.PropTypes.func.isRequired,
    onForceReboot: React.PropTypes.func.isRequired
};

/**
 * List of all VMs defined on this host
 */
const HostVmsList = ({ vms, config, dispatch }) => {
    if (vms.length === 0) {
        return (<div className='container-fluid'>
            <NoVm />
        </div>);
    }

    const sortFunction = (vmA, vmB) => vmA.name.localeCompare(vmB.name);

    return (<div className='container-fluid'>
        <Listing title={_("Virtual Machines")} columnTitles={[_("Name"), _("Connection"), _("State")]}>
            {vms
                .sort(sortFunction)
                .map(vm => {
                return (
                    <Vm vm={vm} config={config}
                        onStart={() => dispatch(startVm(vm))}
                        onReboot={() => dispatch(rebootVm(vm))}
                        onForceReboot={() => dispatch(forceRebootVm(vm))}
                        onShutdown={() => dispatch(shutdownVm(vm))}
                        onForceoff={() => dispatch(forceVmOff(vm))}
                        dispatch={dispatch}
                    />);
            })}
        </Listing>
    </div>);
};
HostVmsList.propTypes = {
    vms: PropTypes.object.isRequired,
    config: PropTypes.object.isRequired,
    dispatch: PropTypes.func.isRequired
};

export default HostVmsList;
