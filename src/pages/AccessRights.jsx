import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardTitle, CardContent } from '@/components/ui/card';
import { ChevronsUpDown, Check, ChevronRight, ChevronDown, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { deleteDataModelService, getDataModelService, saveDataService } from '@/services/dataModelService';
import { useAuth } from '@/contexts/AuthContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { convertDataModelToStringData } from '@/utils/dataModelConverter';

const TreeNode = ({ node, level = 0, onSelect, onRemove, isRemovable = false, selectedItems = [] }) => {
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedItems.some(item => item.id === node.id);

    return (
        <div>
            <div className={cn("flex items-center py-1 px-2 rounded-sm cursor-pointer select-none", level > 0 && "ml-4")}
                onClick={() => {
                    if (hasChildren) {
                        setIsOpen(!isOpen);
                    } else if (onSelect) {
                        onSelect(node);
                    }
                }}
            >
                {hasChildren ? (
                    <div className="mr-1">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                ) : (
                    <div className="w-5"></div>
                )}
                <span className={cn("text-sm flex-grow", !hasChildren && "ml-1")}>
                    {node.label}
                </span>
                {!hasChildren && !isRemovable && isSelected && (
                    <Check className="h-4 w-4 text-green-500" />
                )}
                {isRemovable && onRemove && !hasChildren && (
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-2"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove(node);
                        }}
                    >
                        <X className="h-3 w-3" color='red' />
                    </Button>
                )}
            </div>

            {isOpen && hasChildren && (
                <div>
                    {node.children.map((childNode, index) => (
                        <TreeNode key={`${childNode.id}-${index}`} node={childNode} level={level + 1}
                            onSelect={onSelect} onRemove={onRemove} isRemovable={isRemovable} selectedItems={selectedItems}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const TreeView = ({ data, onSelect, onRemove, isRemovable = false, selectedItems = [] }) => {
    return (
        <div>
            {data.map((node, index) => (
                <TreeNode key={`${node.id}-${index}`} node={node}
                    onSelect={onSelect} onRemove={onRemove} isRemovable={isRemovable} selectedItems={selectedItems}
                />
            ))}
        </div>
    );
};

const AccessRights = () => {
    const [roleDetails, setRoleDetails] = useState({ roleName: "", roleId: "", description: "" });
    const [rolesList, setRolesList] = useState([]);

    const [openRolePopover, setOpenRolePopover] = useState(false);

    const [roleSearchInput, setRoleSearchInput] = useState("");

    const [loadingRoles, setLoadingRoles] = useState(false);
    const [loading, setLoading] = useState(false);
    const [hasFetchedData, setHasFetchedData] = useState(false);
    const [saving, setSaving] = useState(false);


    const [formsList, setFormsList] = useState([]);
    const [loadingForms, setLoadingForms] = useState(false);
    const [treeData, setTreeData] = useState([]);
    const [filteredTreeData, setFilteredTreeData] = useState([]);
    const [selectedForms, setSelectedForms] = useState([]);
    const [assignedFormsTreeData, setAssignedFormsTreeData] = useState([]);

    const { toast } = useToast();
    const { userData } = useAuth();

    useEffect(() => {
        if (!hasFetchedData && userData?.currentUserLogin && userData?.clientURL) {
            fetchRolesData();
            fetchFormsData();
            setHasFetchedData(true);
        }
    }, [userData?.currentUserLogin, userData?.clientURL, hasFetchedData]);

    useEffect(() => {
        if (formsList.length > 0) {
            const treeStructure = [];
            const moduleMap = {};

            formsList.forEach(form => {
                if (!moduleMap[form.MODULE_NAME]) {
                    moduleMap[form.MODULE_NAME] = { id: `module-${form.MODULE_NAME}`, label: form.MODULE_NAME, children: {} };
                }

                const formTypes = moduleMap[form.MODULE_NAME].children;
                if (!formTypes[form.FORM_TYPE]) {
                    formTypes[form.FORM_TYPE] = { id: `type-${form.MODULE_NAME}-${form.FORM_TYPE}`, label: form.FORM_TYPE, children: [] };
                }

                formTypes[form.FORM_TYPE].children.push({ id: form.FORM_NAME, label: form.DESCRIPTION || form.FORM_NAME, formData: form, type: 'Form' });
            });

            Object.values(moduleMap).forEach(module => {
                const moduleNode = { id: module.id, label: module.label, children: [] };

                Object.values(module.children).forEach(formType => {
                    moduleNode.children.push(formType);
                });

                treeStructure.push(moduleNode);
            });

            setTreeData(treeStructure);
            setFilteredTreeData(treeStructure);
        }
    }, [formsList]);

    useEffect(() => {
        if (treeData.length > 0) {
            const filterFormsNotSelected = (tree) => {
                return tree.map(moduleNode => {
                    const newModuleNode = { ...moduleNode };

                    if (newModuleNode.children && newModuleNode.children.length > 0) {
                        newModuleNode.children = newModuleNode.children.map(formTypeNode => {
                            const newFormTypeNode = { ...formTypeNode };

                            if (newFormTypeNode.children && newFormTypeNode.children.length > 0) {
                                newFormTypeNode.children = newFormTypeNode.children.filter(formNode =>
                                    !selectedForms.some(selectedForm => selectedForm.id === formNode.id)
                                );
                            }

                            return newFormTypeNode;
                        }).filter(formTypeNode =>
                            formTypeNode.children && formTypeNode.children.length > 0
                        );
                    }

                    return newModuleNode.children && newModuleNode.children.length > 0 ? newModuleNode : null;
                }).filter(Boolean);
            };

            setFilteredTreeData(filterFormsNotSelected(treeData));
        }
    }, [selectedForms, treeData]);

    useEffect(() => {
        if (selectedForms.length > 0) {
            const moduleMap = {};

            selectedForms.forEach(form => {
                const moduleName = form.formData.MODULE_NAME;
                const formType = form.formData.FORM_TYPE || "General";

                if (!moduleMap[moduleName]) {
                    moduleMap[moduleName] = { id: `assigned-module-${moduleName}`, label: moduleName, children: {} };
                }

                const formTypes = moduleMap[moduleName].children;
                if (!formTypes[formType]) {
                    formTypes[formType] = { id: `assigned-type-${moduleName}-${formType}`, label: formType, children: [] };
                }

                formTypes[formType].children.push({ id: form.id, label: form.label, formData: form.formData, type: 'Form' });
            });

            const assignedTreeStructure = [];
            Object.values(moduleMap).forEach(module => {
                const moduleNode = { id: module.id, label: module.label, children: [] };

                Object.values(module.children).forEach(formType => {
                    moduleNode.children.push(formType);
                });

                assignedTreeStructure.push(moduleNode);
            });

            setAssignedFormsTreeData(assignedTreeStructure);
        } else {
            setAssignedFormsTreeData([]);
        }
    }, [selectedForms]);

    const fetchRolesData = async () => {
        setLoadingRoles(true);
        try {
            const rolesdetailsData = { DataModelName: "general_roles_master", WhereCondition: "IS_FOR_APPROVAL = 'F'", Orderby: "ROLE_ID" };
            const response = await getDataModelService(rolesdetailsData, userData?.currentUserLogin, userData?.clientURL);
            const formattedRoles = response.map(role => ({ roleName: role.ROLE_NAME?.trim(), roleId: role.ROLE_ID.toString(), description: role.ROLE_DESCRIPTION || "" }));

            setRolesList(formattedRoles);
        } catch (error) {
            toast({ variant: "destructive", title: "Error fetching roles", description: error.message });
        } finally {
            setLoadingRoles(false);
        }
    };

    const fetchFormsData = async () => {
        setLoadingForms(true);
        try {
            const formsRequestData = { DataModelName: 'FORMS_MASTER', WhereCondition: '', Orderby: 'MODULE_NAME, FORM_TYPE' };
            const response = await getDataModelService(formsRequestData, userData?.currentUserLogin, userData?.clientURL);

            const formsArray = Array.isArray(response) ? response : response?.data || [];
            setFormsList(formsArray);
        } catch (error) {
            setFormsList([]);
            toast({ variant: 'destructive', title: 'Error fetching forms', description: error.message || 'Failed to fetch forms master data' });
        } finally {
            setLoadingForms(false);
        }
    };

    const fetchRoleFormAccess = async (roleId) => {
        if (!roleId) return;

        setLoading(true);
        try {
            const rightRequestData = { DataModelName: "USER_RIGHTS_ROLES", WhereCondition: `ROLE_ID = '${roleId}'`, Orderby: "MODULE_NAME, FORM_NAME" };

            const rightsResponse = await getDataModelService(rightRequestData, userData?.currentUserLogin, userData?.clientURL);

            if (!Array.isArray(rightsResponse)) {
                setSelectedForms([]);
                setLoading(false);
                return;
            }

            const formItems = rightsResponse.map(right => ({
                id: right.FORM_NAME, label: right.FORM_NAME,
                formData: { MODULE_NAME: right.MODULE_NAME || '', FORM_NAME: right.FORM_NAME, DESCRIPTION: right.FORM_NAME, FORM_TYPE: right.FORM_TYPE || '' }
            }));

            setSelectedForms(formItems);

            try {
                const formNames = rightsResponse.map(right => `'${right.FORM_NAME}'`).join(',');
                if (formNames) {
                    const formsRequestData = {
                        DataModelName: "FORMS_MASTER", WhereCondition: `FORM_NAME IN (${formNames})`, Orderby: "MODULE_NAME, FORM_NAME"
                    };

                    const formsResponse = await getDataModelService(formsRequestData, userData?.currentUserLogin, userData?.clientURL);

                    if (Array.isArray(formsResponse)) {
                        const updatedFormItems = formItems.map(item => {
                            const formDetails = formsResponse.find(f => f.FORM_NAME === item.id) || {};
                            return {
                                ...item,
                                label: formDetails.DESCRIPTION || item.label,
                                formData: {
                                    ...item.formData,
                                    DESCRIPTION: formDetails.DESCRIPTION || item.formData.DESCRIPTION,
                                    FORM_TYPE: formDetails.FORM_TYPE || item.formData.FORM_TYPE
                                }
                            };
                        });
                        setSelectedForms(updatedFormItems);
                    }
                }
            } catch (error) {
                console.error("Error fetching form details:", error);
            }

        } catch (error) {
            console.error("Error fetching role form access:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to fetch form access rights for this role"
            });
            setSelectedForms([]);
        } finally {
            setLoading(false);
        }
    };

    const handleRoleSelect = (role) => {
        setRoleDetails({ roleName: role.roleName, roleId: role.roleId, description: role.description || "" });
        setOpenRolePopover(false);
        fetchRoleFormAccess(role.roleId);
    };

    const handleFormSelect = (node) => {
        const isAlreadySelected = selectedForms.some(form => form.id === node.id);

        if (!isAlreadySelected) {
            setSelectedForms(prev => [...prev, node]);
            toast({ title: "Form added", description: `${node.label} added to selection` });
        } else {
            toast({ variant: "default", title: "Info", description: "This form is already selected" });
        }
    };

    const handleRemoveSelectedForm = async (node) => {
        try {
            setSelectedForms(prev => prev.filter(form => form.id !== node.id));

            toast({ title: "Form removed", description: `${node.label} removed from selection`, duration: 2000 });

            if (roleDetails.roleId) {
                try {
                    const deletePayload = { UserName: userData.currentUserLogin, DataModelName: "USER_RIGHTS_ROLES", WhereCondition: `ROLE_ID = '${roleDetails.roleId}' AND FORM_NAME = '${node.id}'` };

                    await deleteDataModelService(deletePayload, userData.currentUserLogin, userData.clientURL);
                } catch (deleteError) {
                    console.error("Error removing from database:", deleteError);
                }
            }

        } catch (error) {
            console.error("Error removing form:", error);
            toast({ variant: "destructive", title: "Error removing form", description: error.message || "Failed to remove form access" });
        }
    };

    const handleSave = async () => {
        if (!roleDetails.roleId || selectedForms.length === 0) {
            toast({ variant: "destructive", title: "Validation Error", description: "Please select both a role and at least one category item" });
            return;
        }

        setSaving(true);
        try {
            for (const form of selectedForms) {
                const formAccessData = { ROLE_ID: roleDetails.roleId, MODULE_NAME: form.formData.MODULE_NAME, FORM_NAME: form.id, CAN_CUSTOMIZE: "F" };

                const data = convertDataModelToStringData("USER_RIGHTS_ROLES", formAccessData);

                const savePayload = { UserName: userData.currentUserLogin, DModelData: data };
                console.log(savePayload)
                const saveResponse = await saveDataService(savePayload, userData.currentUserLogin, userData.clientURL);

                if (saveResponse === null || saveResponse === undefined || (typeof saveResponse === 'object' && saveResponse.error)) {
                    throw new Error(`Failed to save category ${form.label} to role ${roleDetails.roleName}`);
                }
            }

            await fetchRoleFormAccess(roleDetails.roleId);

            toast({ variant: "default", title: "Success", description: `Saved ${selectedForms.length} category items to role ${roleDetails.roleName}`, duration: 3000 });
        } catch (error) {
            console.error("Save error:", error);
            toast({ variant: "destructive", title: "Save failed", description: error.message || "Failed to save category access rights" });
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setRoleDetails({ roleName: "", roleId: "", description: "" });
        setSelectedForms([]);
    };

    return (
        <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold">Access Rights For Roles</h1>

            <div className="flex flex-col md:flex-row gap-4 items-start">
                {/* Role Details */}
                <Card className="border flex-grow">
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>Select Roles</Label>
                                <Popover open={openRolePopover} onOpenChange={setOpenRolePopover}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" role="combobox" className="w-full justify-between text-left font-normal">
                                            {roleDetails.roleName || "Select role name"}
                                            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] h-[200px] p-0 z-50">
                                        <Command>
                                            <CommandInput placeholder="Search role name" value={roleSearchInput} onValueChange={setRoleSearchInput} />
                                            <CommandList>
                                                <CommandEmpty>No roles found.</CommandEmpty>
                                                <CommandGroup>
                                                    {loadingRoles ? (
                                                        <div className="p-4 text-center text-sm text-muted-foreground">
                                                            Loading roles...
                                                        </div>
                                                    ) : (
                                                        rolesList.filter(role =>
                                                            role.roleName.toLowerCase().includes(roleSearchInput.toLowerCase())
                                                        ).map((role) => (
                                                            <CommandItem key={`role-${role.roleId}`} value={role.roleName} onSelect={() => handleRoleSelect(role)} >
                                                                {role.roleName}
                                                                <Check className={cn("ml-auto h-4 w-4", roleDetails.roleId === role.roleId ? "opacity-100" : "opacity-0")} />
                                                            </CommandItem>
                                                        ))
                                                    )}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>
                                <Label htmlFor="description" className="text-gray-500">Description - {roleDetails.description}</Label>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Buttons */}
                <div className="flex gap-4 md:self-end md:pb-6">
                    <Button variant="outline" onClick={handleCancel} disabled={!roleDetails.roleId}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving || !roleDetails.roleId || selectedForms.length === 0}>
                        {saving ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Add Rights */}
                <Card className={cn("border", !roleDetails.roleId && "opacity-50 pointer-events-none")}>
                    <CardTitle className="text-lg font-semibold pl-6 pt-4">Add Access Rights</CardTitle>
                    <CardContent className="p-6 pt-2">
                        <div className="flex flex-col space-y-4">
                            <div className="border rounded-md h-80 overflow-hidden">
                                {loadingForms ? (
                                    <div className="flex items-center justify-center h-full">
                                        <span className="text-sm text-muted-foreground">Loading forms...</span>
                                    </div>
                                ) : filteredTreeData.length > 0 ? (
                                    <ScrollArea className="h-full w-full p-2">
                                        <TreeView
                                            data={filteredTreeData}
                                            onSelect={handleFormSelect}
                                            selectedItems={selectedForms}
                                        />
                                    </ScrollArea>
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <span className="text-sm text-muted-foreground">All available forms are already added</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground flex justify-between">
                                <span>Available Forms</span>
                                <span>Click on a form to add it to this role</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Remove Rights */}
                <Card className={cn("border", !roleDetails.roleId && "opacity-50 pointer-events-none")}>
                    <CardTitle className="text-lg font-semibold pl-6 pt-4">Remove Access Rights</CardTitle>
                    <CardContent className="p-6 pt-2">
                        <div className="flex flex-col space-y-4">
                            <div className="border rounded-md h-80 overflow-hidden">
                                {loading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <span className="text-sm text-muted-foreground">Loading assigned forms...</span>
                                    </div>
                                ) : assignedFormsTreeData.length > 0 ? (
                                    <ScrollArea className="h-full w-full p-2">
                                        <TreeView
                                            data={assignedFormsTreeData}
                                            onRemove={handleRemoveSelectedForm}
                                            isRemovable={true}
                                        />
                                    </ScrollArea>
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <span className="text-sm text-muted-foreground">No forms assigned to this role</span>
                                    </div>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground flex justify-between">
                                <span>Assigned Forms ({selectedForms.length})</span>
                                <span>Click the X button to remove a form</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AccessRights;